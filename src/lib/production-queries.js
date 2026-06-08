import { buildWindFarmWhereClause } from './queries.js';

const DEFAULT_LOOKBACK_DAYS = 7;
const MAX_LOOKBACK_DAYS = 90;

function toUtcDateOnly(value) {
  return new Date(`${value}T00:00:00.000Z`);
}

function roundNumber(value, digits = 2) {
  if (value == null || value === '') {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return Number(numeric.toFixed(digits));
}

function shiftDate(dateValue, deltaDays) {
  const date = toUtcDateOnly(dateValue);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

function diffDaysInclusive(startDate, endDate) {
  const start = toUtcDateOnly(startDate).getTime();
  const end = toUtcDateOnly(endDate).getTime();
  return Math.floor((end - start) / 86400000) + 1;
}

export function parseDateOnlyValue(value, flagName = 'date') {
  if (value == null || value === '') {
    return null;
  }

  const normalized = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error(`Invalid ${flagName}: ${value}. Expected YYYY-MM-DD.`);
  }

  const parsed = toUtcDateOnly(normalized);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw new Error(`Invalid ${flagName}: ${value}.`);
  }

  return normalized;
}

export function parsePositiveIntegerValue(value, flagName = 'value') {
  if (value == null || value === '') {
    return null;
  }

  const parsed = Number.parseInt(String(value).trim(), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${flagName}: ${value}. Expected a positive integer.`);
  }

  return parsed;
}

export function normalizeProductionFilters(filters = {}) {
  const normalized = { ...filters };

  if (normalized.startDate) {
    normalized.startDate = parseDateOnlyValue(normalized.startDate, 'start date');
  }

  if (normalized.endDate) {
    normalized.endDate = parseDateOnlyValue(normalized.endDate, 'end date');
  }

  if (normalized.startDate && normalized.endDate) {
    const start = toUtcDateOnly(normalized.startDate).getTime();
    const end = toUtcDateOnly(normalized.endDate).getTime();
    if (start > end) {
      throw new Error(`Invalid date range: start date ${normalized.startDate} is after end date ${normalized.endDate}.`);
    }
  }

  if (normalized.lookbackDays != null) {
    const parsed = parsePositiveIntegerValue(normalized.lookbackDays, 'lookback days');
    if (parsed > MAX_LOOKBACK_DAYS) {
      throw new Error(`Invalid lookback days: ${parsed}. Maximum supported window is ${MAX_LOOKBACK_DAYS} days.`);
    }
    normalized.lookbackDays = parsed;
  }

  return normalized;
}

export function buildProductionUniverseFilters(filters = {}, { defaultCountry = 'United Kingdom' } = {}) {
  const normalized = normalizeProductionFilters(filters);
  return {
    ...normalized,
    country: normalized.country || defaultCountry,
    ids: null,
    windFarmName: null,
  };
}

export async function fetchLatestProductionSettlementDate(client, filters = {}) {
  const { whereClause, params } = buildWindFarmWhereClause(filters);
  const result = await client.query(
    `
      WITH filtered_wind_farms AS (
        SELECT wf.id
        FROM public.core_wind_farms wf
        WHERE ${whereClause}
      ),
      active_mappings AS (
        SELECT DISTINCT link.bmu_id
        FROM public.core_wind_farm_bmu_links link
        JOIN filtered_wind_farms wf
          ON wf.id = link.wind_farm_id
        WHERE COALESCE(link.relationship_type, 'generation') = 'generation'
      )
      SELECT MAX(generation.settlement_date)::text AS latest_settlement_date
      FROM active_mappings map
      JOIN public.fact_elexon_generation_outturn generation
        ON generation.bmu_id = map.bmu_id
    `,
    params,
  );

  return result.rows[0]?.latest_settlement_date || null;
}

export async function resolveProductionWindow(client, filters = {}) {
  const normalized = normalizeProductionFilters(filters);
  const latestAvailableDate =
    normalized.endDate || (await fetchLatestProductionSettlementDate(client, normalized));

  if (!latestAvailableDate) {
    return {
      supported: false,
      latestAvailableDate: null,
      startDate: normalized.startDate || null,
      endDate: normalized.endDate || null,
      previousStartDate: null,
      previousEndDate: null,
      dayCount: 0,
      label: 'No production window available',
    };
  }

  const dayCount =
    normalized.startDate && normalized.endDate
      ? diffDaysInclusive(normalized.startDate, normalized.endDate)
      : normalized.lookbackDays || DEFAULT_LOOKBACK_DAYS;

  const endDate = normalized.endDate || latestAvailableDate;
  const startDate = normalized.startDate || shiftDate(endDate, -(dayCount - 1));
  const previousEndDate = shiftDate(startDate, -1);
  const previousStartDate = shiftDate(previousEndDate, -(dayCount - 1));

  return {
    supported: true,
    latestAvailableDate,
    startDate,
    endDate,
    previousStartDate,
    previousEndDate,
    dayCount,
    label: `${startDate} to ${endDate}`,
  };
}

export async function fetchProductionRankingRows(client, filters = {}, productionWindow) {
  const normalized = normalizeProductionFilters(filters);
  const { whereClause, params } = buildWindFarmWhereClause(normalized);

  const previousStartIndex = params.push(productionWindow.previousStartDate);
  const endIndex = params.push(productionWindow.endDate);
  const startIndex = params.push(productionWindow.startDate);
  const previousEndIndex = params.push(productionWindow.previousEndDate);

  const result = await client.query(
    `
      WITH filtered_wind_farms AS (
        SELECT
          wf.id,
          wf.name,
          wf.country,
          wf.type,
          wf.status,
          wf.power_mw,
          wf.turbine_count,
          wf.start_year
        FROM public.core_wind_farms wf
        WHERE ${whereClause}
      ),
      active_mappings AS (
        SELECT
          link.wind_farm_id,
          link.bmu_id,
          COALESCE(link.allocation_factor, 1)::numeric AS allocation_factor,
          link.is_primary,
          link.mapping_source,
          link.confidence
        FROM public.core_wind_farm_bmu_links link
        JOIN filtered_wind_farms wf
          ON wf.id = link.wind_farm_id
        WHERE COALESCE(link.relationship_type, 'generation') = 'generation'
          AND (link.effective_from IS NULL OR link.effective_from::date <= $${endIndex})
          AND (link.effective_to IS NULL OR link.effective_to::date >= $${previousStartIndex})
      ),
      mapping_summary AS (
        SELECT
          wind_farm_id,
          COUNT(DISTINCT bmu_id)::integer AS mapped_bmu_count,
          MAX(CASE WHEN is_primary THEN bmu_id ELSE NULL END) AS primary_bmu_id,
          MAX(mapping_source) FILTER (WHERE mapping_source IS NOT NULL) AS mapping_source,
          ROUND(AVG(confidence)::numeric, 3) AS average_mapping_confidence,
          ROUND(COALESCE(SUM(allocation_factor), 0)::numeric, 3) AS total_allocation_factor
        FROM active_mappings
        GROUP BY wind_farm_id
      ),
      raw_generation AS (
        SELECT
          map.wind_farm_id,
          generation.settlement_date,
          generation.settlement_period,
          ROUND(SUM(COALESCE(generation.quantity_mwh, 0) * map.allocation_factor)::numeric, 6) AS allocated_generation_mwh,
          MAX(generation.published_at) AS published_at
        FROM active_mappings map
        JOIN public.fact_elexon_generation_outturn generation
          ON generation.bmu_id = map.bmu_id
        WHERE generation.settlement_date BETWEEN $${previousStartIndex} AND $${endIndex}
        GROUP BY map.wind_farm_id, generation.settlement_date, generation.settlement_period
      ),
      daily_generation AS (
        SELECT
          wind_farm_id,
          settlement_date,
          ROUND(SUM(allocated_generation_mwh)::numeric, 3) AS generation_mwh,
          COUNT(*)::integer AS interval_count,
          MAX(published_at) AS published_at
        FROM raw_generation
        GROUP BY wind_farm_id, settlement_date
      ),
      aggregated AS (
        SELECT
          wind_farm_id,
          ROUND((SUM(generation_mwh) FILTER (
            WHERE settlement_date BETWEEN $${startIndex} AND $${endIndex}
          ))::numeric, 3) AS current_generation_mwh,
          COUNT(DISTINCT settlement_date) FILTER (
            WHERE settlement_date BETWEEN $${startIndex} AND $${endIndex}
          )::integer AS current_day_count,
          COALESCE(SUM(interval_count) FILTER (
            WHERE settlement_date BETWEEN $${startIndex} AND $${endIndex}
          ), 0)::integer AS current_interval_count,
          ROUND((AVG(generation_mwh) FILTER (
            WHERE settlement_date BETWEEN $${startIndex} AND $${endIndex}
          ))::numeric, 3) AS average_daily_generation_mwh,
          MAX(settlement_date) FILTER (
            WHERE settlement_date BETWEEN $${startIndex} AND $${endIndex}
          ) AS latest_settlement_date,
          MAX(published_at) FILTER (
            WHERE settlement_date BETWEEN $${startIndex} AND $${endIndex}
          ) AS latest_published_at,
          ROUND((SUM(generation_mwh) FILTER (
            WHERE settlement_date BETWEEN $${previousStartIndex} AND $${previousEndIndex}
          ))::numeric, 3) AS previous_generation_mwh,
          COUNT(DISTINCT settlement_date) FILTER (
            WHERE settlement_date BETWEEN $${previousStartIndex} AND $${previousEndIndex}
          )::integer AS previous_day_count
        FROM daily_generation
        GROUP BY wind_farm_id
      )
      SELECT
        wf.id,
        wf.name,
        wf.country,
        wf.type,
        wf.status,
        wf.power_mw,
        wf.turbine_count,
        wf.start_year,
        COALESCE(mapping_summary.mapped_bmu_count, 0)::integer AS mapped_bmu_count,
        mapping_summary.primary_bmu_id,
        mapping_summary.mapping_source,
        mapping_summary.average_mapping_confidence,
        mapping_summary.total_allocation_factor,
        COALESCE(aggregated.current_generation_mwh, 0)::numeric AS current_generation_mwh,
        COALESCE(aggregated.previous_generation_mwh, 0)::numeric AS previous_generation_mwh,
        ROUND((
          COALESCE(aggregated.current_generation_mwh, 0) -
          COALESCE(aggregated.previous_generation_mwh, 0)
        )::numeric, 3) AS delta_generation_mwh,
        CASE
          WHEN COALESCE(aggregated.previous_generation_mwh, 0) = 0 THEN NULL
          ELSE ROUND((
            (
              COALESCE(aggregated.current_generation_mwh, 0) -
              aggregated.previous_generation_mwh
            ) / NULLIF(aggregated.previous_generation_mwh, 0)
          * 100)::numeric, 2)
        END AS delta_generation_pct,
        COALESCE(aggregated.current_day_count, 0)::integer AS current_day_count,
        COALESCE(aggregated.previous_day_count, 0)::integer AS previous_day_count,
        COALESCE(aggregated.current_interval_count, 0)::integer AS current_interval_count,
        aggregated.latest_settlement_date,
        aggregated.latest_published_at,
        COALESCE(aggregated.average_daily_generation_mwh, 0)::numeric AS average_daily_generation_mwh,
        CASE
          WHEN wf.power_mw IS NULL OR wf.power_mw = 0 OR COALESCE(aggregated.current_day_count, 0) = 0 THEN NULL
          ELSE ROUND((
            COALESCE(aggregated.current_generation_mwh, 0) /
            NULLIF(wf.power_mw * aggregated.current_day_count * 24, 0)
          * 100)::numeric, 2)
        END AS capacity_factor_pct
      FROM filtered_wind_farms wf
      LEFT JOIN mapping_summary
        ON mapping_summary.wind_farm_id = wf.id
      LEFT JOIN aggregated
        ON aggregated.wind_farm_id = wf.id
      ORDER BY
        COALESCE(aggregated.current_generation_mwh, 0) DESC,
        capacity_factor_pct DESC NULLS LAST,
        COALESCE(wf.power_mw, 0) DESC,
        wf.name ASC
    `,
    params,
  );

  return result.rows.map((row) => ({
    ...row,
    power_mw: roundNumber(row.power_mw),
    average_mapping_confidence: roundNumber(row.average_mapping_confidence, 3),
    total_allocation_factor: roundNumber(row.total_allocation_factor, 3),
    current_generation_mwh: roundNumber(row.current_generation_mwh, 3) ?? 0,
    previous_generation_mwh: roundNumber(row.previous_generation_mwh, 3) ?? 0,
    delta_generation_mwh: roundNumber(row.delta_generation_mwh, 3) ?? 0,
    delta_generation_pct: roundNumber(row.delta_generation_pct, 2),
    average_daily_generation_mwh: roundNumber(row.average_daily_generation_mwh, 3) ?? 0,
    capacity_factor_pct: roundNumber(row.capacity_factor_pct, 2),
  }));
}

export async function fetchWindFarmDailyGeneration(client, filters = {}, productionWindow) {
  const normalized = normalizeProductionFilters(filters);
  const { whereClause, params } = buildWindFarmWhereClause(normalized);

  const startIndex = params.push(productionWindow.startDate);
  const endIndex = params.push(productionWindow.endDate);

  const result = await client.query(
    `
      WITH filtered_wind_farms AS (
        SELECT wf.id
        FROM public.core_wind_farms wf
        WHERE ${whereClause}
      ),
      active_mappings AS (
        SELECT
          link.wind_farm_id,
          link.bmu_id,
          COALESCE(link.allocation_factor, 1)::numeric AS allocation_factor
        FROM public.core_wind_farm_bmu_links link
        JOIN filtered_wind_farms wf
          ON wf.id = link.wind_farm_id
        WHERE COALESCE(link.relationship_type, 'generation') = 'generation'
          AND (link.effective_from IS NULL OR link.effective_from::date <= $${endIndex})
          AND (link.effective_to IS NULL OR link.effective_to::date >= $${startIndex})
      )
      SELECT
        generation.settlement_date,
        ROUND(SUM(COALESCE(generation.quantity_mwh, 0) * map.allocation_factor)::numeric, 3) AS generation_mwh,
        COUNT(*)::integer AS interval_count,
        MAX(generation.published_at) AS published_at
      FROM active_mappings map
      JOIN public.fact_elexon_generation_outturn generation
        ON generation.bmu_id = map.bmu_id
      WHERE generation.settlement_date BETWEEN $${startIndex} AND $${endIndex}
      GROUP BY generation.settlement_date
      ORDER BY generation.settlement_date ASC
    `,
    params,
  );

  return result.rows.map((row) => ({
    ...row,
    generation_mwh: roundNumber(row.generation_mwh, 3) ?? 0,
  }));
}

export async function fetchWindFarmBmuMappings(client, filters = {}, productionWindow) {
  const normalized = normalizeProductionFilters(filters);
  const { whereClause, params } = buildWindFarmWhereClause(normalized);

  const startIndex = params.push(productionWindow.startDate);
  const endIndex = params.push(productionWindow.endDate);

  const result = await client.query(
    `
      WITH filtered_wind_farms AS (
        SELECT wf.id
        FROM public.core_wind_farms wf
        WHERE ${whereClause}
      )
      SELECT
        link.wind_farm_id,
        link.bmu_id,
        current_units.national_grid_bmu_id,
        current_units.fuel_type,
        current_units.lead_party_name,
        current_units.source_row->>'bmUnitName' AS bm_unit_name,
        link.allocation_factor,
        link.is_primary,
        link.mapping_source,
        link.confidence,
        link.effective_from,
        link.effective_to,
        link.notes
      FROM public.core_wind_farm_bmu_links link
      JOIN filtered_wind_farms wf
        ON wf.id = link.wind_farm_id
      LEFT JOIN public.dim_elexon_bm_units_current current_units
        ON current_units.bmu_id = link.bmu_id
      WHERE COALESCE(link.relationship_type, 'generation') = 'generation'
        AND (link.effective_from IS NULL OR link.effective_from::date <= $${endIndex})
        AND (link.effective_to IS NULL OR link.effective_to::date >= $${startIndex})
      ORDER BY link.is_primary DESC, link.allocation_factor DESC, link.bmu_id ASC
    `,
    params,
  );

  return result.rows.map((row) => ({
    ...row,
    allocation_factor: roundNumber(row.allocation_factor, 3),
    confidence: roundNumber(row.confidence, 3),
  }));
}
