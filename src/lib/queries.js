export function parseIdsValue(value) {
  if (!value) {
    return null;
  }

  const ids = String(value)
    .split(',')
    .map((segment) => {
      const parsed = Number.parseInt(segment.trim(), 10);
      if (!Number.isInteger(parsed)) {
        throw new Error(`Invalid id in list: ${segment}`);
      }
      return parsed;
    });

  return ids.length > 0 ? ids : null;
}

export function buildWindFarmWhereClause(filters = {}, tableAlias = 'wf') {
  const conditions = [
    `${tableAlias}.name is not null`,
    `${tableAlias}.record_status = 'active'`,
    `COALESCE(${tableAlias}.status, '') <> 'Archive'`,
  ];
  const params = [];

  if (Array.isArray(filters.ids) && filters.ids.length > 0) {
    params.push(filters.ids);
    conditions.push(`${tableAlias}.id = ANY($${params.length})`);
  }

  if (filters.country) {
    params.push(filters.country);
    conditions.push(`LOWER(${tableAlias}.country) = LOWER($${params.length})`);
  }

  if (filters.windFarmType) {
    params.push(filters.windFarmType);
    conditions.push(`${tableAlias}.type = $${params.length}`);
  }

  if (filters.status) {
    params.push(filters.status);
    conditions.push(`LOWER(COALESCE(${tableAlias}.status, '')) = LOWER($${params.length})`);
  }

  return {
    whereClause: conditions.join(' AND '),
    params,
  };
}

export async function getSchemaCapabilities(client) {
  const result = await client.query(`
    SELECT
      to_regclass('public.research_wind_farm_reports') IS NOT NULL AS has_research_reports,
      to_regclass('public.wind_farm_facts') IS NOT NULL AS has_wind_farm_facts,
      to_regclass('public.wind_farm_community_notes') IS NOT NULL AS has_community_notes,
      to_regclass('public.research_report_evidence') IS NOT NULL AS has_research_report_evidence
  `);

  const row = result.rows[0] || {};

  return {
    hasResearchReports: row.has_research_reports === true,
    hasWindFarmFacts: row.has_wind_farm_facts === true,
    hasCommunityNotes: row.has_community_notes === true,
    hasResearchReportEvidence: row.has_research_report_evidence === true,
  };
}

export async function fetchPortfolioSummary(client, filters = {}) {
  const { whereClause, params } = buildWindFarmWhereClause(filters);
  const result = await client.query(
    `
      SELECT
        COUNT(*)::integer AS wind_farm_count,
        COUNT(DISTINCT NULLIF(wf.country, ''))::integer AS country_count,
        COALESCE(ROUND(SUM(wf.power_mw)::numeric, 2), 0)::numeric AS total_capacity_mw,
        COALESCE(ROUND(AVG(wf.power_mw)::numeric, 2), 0)::numeric AS average_capacity_mw,
        COALESCE(ROUND(AVG(wf.turbine_count)::numeric, 2), 0)::numeric AS average_turbine_count,
        COUNT(*) FILTER (WHERE wf.power_mw IS NULL)::integer AS missing_capacity_count,
        COUNT(*) FILTER (WHERE wf.turbine_count IS NULL)::integer AS missing_turbine_count,
        COUNT(*) FILTER (WHERE wf.status IS NULL OR BTRIM(wf.status) = '')::integer AS missing_status_count
      FROM public.core_wind_farms wf
      WHERE ${whereClause}
    `,
    params,
  );

  return result.rows[0] || null;
}

export async function fetchCountryBreakdown(client, filters = {}) {
  const { whereClause, params } = buildWindFarmWhereClause(filters);
  const result = await client.query(
    `
      SELECT
        COALESCE(NULLIF(BTRIM(wf.country), ''), 'Unknown') AS country,
        COUNT(*)::integer AS wind_farm_count,
        COALESCE(ROUND(SUM(wf.power_mw)::numeric, 2), 0)::numeric AS total_capacity_mw,
        COUNT(*) FILTER (WHERE LOWER(COALESCE(wf.status, '')) = 'operational')::integer AS operational_count
      FROM public.core_wind_farms wf
      WHERE ${whereClause}
      GROUP BY 1
      ORDER BY total_capacity_mw DESC, wind_farm_count DESC, country ASC
      LIMIT 10
    `,
    params,
  );

  return result.rows;
}

export async function fetchStatusBreakdown(client, filters = {}) {
  const { whereClause, params } = buildWindFarmWhereClause(filters);
  const result = await client.query(
    `
      SELECT
        COALESCE(NULLIF(BTRIM(wf.status), ''), 'Unknown') AS status,
        COUNT(*)::integer AS wind_farm_count,
        COALESCE(ROUND(SUM(wf.power_mw)::numeric, 2), 0)::numeric AS total_capacity_mw
      FROM public.core_wind_farms wf
      WHERE ${whereClause}
      GROUP BY 1
      ORDER BY wind_farm_count DESC, total_capacity_mw DESC, status ASC
      LIMIT 12
    `,
    params,
  );

  return result.rows;
}

export async function fetchMissingMetadata(client, filters = {}) {
  const { whereClause, params } = buildWindFarmWhereClause(filters);
  const result = await client.query(
    `
      SELECT
        wf.id,
        wf.name,
        wf.country,
        wf.type,
        wf.status,
        wf.power_mw,
        wf.turbine_count,
        (
          (wf.power_mw IS NULL)::integer +
          (wf.turbine_count IS NULL)::integer +
          CASE WHEN wf.status IS NULL OR BTRIM(wf.status) = '' THEN 1 ELSE 0 END
        )::integer AS missing_field_count
      FROM public.core_wind_farms wf
      WHERE ${whereClause}
        AND (
          wf.power_mw IS NULL OR
          wf.turbine_count IS NULL OR
          wf.status IS NULL OR
          BTRIM(wf.status) = ''
        )
      ORDER BY missing_field_count DESC, COALESCE(wf.power_mw, 0) DESC, wf.id ASC
      LIMIT 20
    `,
    params,
  );

  return result.rows;
}

export async function fetchCapacityMismatchCandidates(client, filters = {}) {
  const { whereClause, params } = buildWindFarmWhereClause(filters);
  const result = await client.query(
    `
      WITH filtered_wind_farms AS (
        SELECT *
        FROM public.core_wind_farms wf
        WHERE ${whereClause}
      ),
      linked_power AS (
        SELECT
          wf.id AS wind_farm_id,
          COUNT(link.turbine_source_key)::integer AS linked_turbine_count,
          COUNT(*) FILTER (
            WHERE link.turbine_source_key IS NOT NULL
              AND turbine.rated_power_mw IS NULL
          )::integer AS linked_turbines_missing_rated_power,
          COALESCE(ROUND(SUM(turbine.rated_power_mw)::numeric, 2), 0)::numeric AS linked_capacity_mw
        FROM filtered_wind_farms wf
        LEFT JOIN public.core_wind_farm_turbine_links link
          ON link.wind_farm_source_key = wf.source_key
        LEFT JOIN public.core_turbines turbine
          ON turbine.source_key = link.turbine_source_key
        GROUP BY wf.id
      )
      SELECT
        wf.id,
        wf.name,
        wf.country,
        wf.status,
        wf.power_mw AS recorded_capacity_mw,
        wf.turbine_count AS recorded_turbine_count,
        linked.linked_turbine_count,
        linked.linked_turbines_missing_rated_power,
        linked.linked_capacity_mw,
        ROUND(ABS(wf.power_mw - linked.linked_capacity_mw)::numeric, 2) AS absolute_delta_mw
      FROM filtered_wind_farms wf
      JOIN linked_power linked
        ON linked.wind_farm_id = wf.id
      WHERE wf.power_mw IS NOT NULL
        AND linked.linked_turbine_count > 0
        AND linked.linked_turbines_missing_rated_power = 0
        AND ABS(wf.power_mw - linked.linked_capacity_mw) >= 25
      ORDER BY absolute_delta_mw DESC, recorded_capacity_mw DESC, wf.id ASC
      LIMIT 20
    `,
    params,
  );

  return result.rows;
}

export async function fetchUnlinkedOperationalFarms(client, filters = {}) {
  const { whereClause, params } = buildWindFarmWhereClause(filters);
  const result = await client.query(
    `
      WITH filtered_wind_farms AS (
        SELECT *
        FROM public.core_wind_farms wf
        WHERE ${whereClause}
      ),
      link_counts AS (
        SELECT
          link.wind_farm_source_key,
          COUNT(*)::integer AS linked_turbine_count
        FROM public.core_wind_farm_turbine_links link
        GROUP BY link.wind_farm_source_key
      )
      SELECT
        wf.id,
        wf.name,
        wf.country,
        wf.status,
        wf.power_mw,
        wf.turbine_count,
        COALESCE(link_counts.linked_turbine_count, 0)::integer AS linked_turbine_count
      FROM filtered_wind_farms wf
      LEFT JOIN link_counts
        ON link_counts.wind_farm_source_key = wf.source_key
      WHERE LOWER(COALESCE(wf.status, '')) = 'operational'
        AND COALESCE(link_counts.linked_turbine_count, 0) = 0
      ORDER BY COALESCE(wf.power_mw, 0) DESC, wf.id ASC
      LIMIT 20
    `,
    params,
  );

  return result.rows;
}

export async function fetchResearchCoverageSummary(client, filters = {}, capabilities = {}) {
  if (!capabilities.hasResearchReports) {
    return {
      supported: false,
      wind_farm_count: 0,
      researched_count: 0,
      published_count: 0,
      draft_count: 0,
      rejected_count: 0,
      missing_count: 0,
    };
  }

  const { whereClause, params } = buildWindFarmWhereClause(filters);
  const result = await client.query(
    `
      WITH filtered_wind_farms AS (
        SELECT *
        FROM public.core_wind_farms wf
        WHERE ${whereClause}
      ),
      latest_reports AS (
        SELECT DISTINCT ON (report.wind_farm_id)
          report.wind_farm_id,
          report.id,
          report.review_status,
          report.researched_at
        FROM public.research_wind_farm_reports report
        ORDER BY report.wind_farm_id, report.researched_at DESC, report.id DESC
      )
      SELECT
        TRUE AS supported,
        COUNT(*)::integer AS wind_farm_count,
        COUNT(latest_reports.wind_farm_id)::integer AS researched_count,
        COUNT(*) FILTER (WHERE latest_reports.review_status = 'published')::integer AS published_count,
        COUNT(*) FILTER (WHERE latest_reports.review_status = 'draft')::integer AS draft_count,
        COUNT(*) FILTER (WHERE latest_reports.review_status = 'rejected')::integer AS rejected_count,
        COUNT(*) FILTER (WHERE latest_reports.wind_farm_id IS NULL)::integer AS missing_count
      FROM filtered_wind_farms wf
      LEFT JOIN latest_reports
        ON latest_reports.wind_farm_id = wf.id
    `,
    params,
  );

  return result.rows[0] || null;
}

export async function fetchHighValueResearchTargets(client, filters = {}, capabilities = {}) {
  if (!capabilities.hasResearchReports) {
    return [];
  }

  const { whereClause, params } = buildWindFarmWhereClause(filters);
  const result = await client.query(
    `
      WITH filtered_wind_farms AS (
        SELECT *
        FROM public.core_wind_farms wf
        WHERE ${whereClause}
      ),
      latest_reports AS (
        SELECT DISTINCT ON (report.wind_farm_id)
          report.wind_farm_id,
          report.review_status,
          report.researched_at
        FROM public.research_wind_farm_reports report
        ORDER BY report.wind_farm_id, report.researched_at DESC, report.id DESC
      )
      SELECT
        wf.id,
        wf.name,
        wf.country,
        wf.status,
        wf.power_mw,
        wf.turbine_count
      FROM filtered_wind_farms wf
      LEFT JOIN latest_reports
        ON latest_reports.wind_farm_id = wf.id
      WHERE latest_reports.wind_farm_id IS NULL
      ORDER BY COALESCE(wf.power_mw, 0) DESC, COALESCE(wf.turbine_count, 0) DESC, wf.id ASC
      LIMIT 20
    `,
    params,
  );

  return result.rows;
}

export async function fetchRecentReportActivity(client, filters = {}, capabilities = {}) {
  if (!capabilities.hasResearchReports) {
    return [];
  }

  const { whereClause, params } = buildWindFarmWhereClause(filters);
  const result = await client.query(
    `
      WITH filtered_wind_farms AS (
        SELECT *
        FROM public.core_wind_farms wf
        WHERE ${whereClause}
      ),
      latest_reports AS (
        SELECT DISTINCT ON (report.wind_farm_id)
          report.wind_farm_id,
          report.id,
          report.review_status,
          report.researched_at,
          report.model_used
        FROM public.research_wind_farm_reports report
        ORDER BY report.wind_farm_id, report.researched_at DESC, report.id DESC
      )
      SELECT
        wf.id AS wind_farm_id,
        wf.name,
        wf.country,
        latest_reports.review_status,
        latest_reports.researched_at,
        latest_reports.model_used
      FROM filtered_wind_farms wf
      JOIN latest_reports
        ON latest_reports.wind_farm_id = wf.id
      ORDER BY latest_reports.researched_at DESC NULLS LAST, wf.id ASC
      LIMIT 15
    `,
    params,
  );

  return result.rows;
}

export async function fetchFactConflicts(client, filters = {}, capabilities = {}) {
  if (!capabilities.hasWindFarmFacts) {
    return [];
  }

  const { whereClause, params } = buildWindFarmWhereClause(filters);
  const result = await client.query(
    `
      WITH filtered_wind_farms AS (
        SELECT *
        FROM public.core_wind_farms wf
        WHERE ${whereClause}
      ),
      ranked_facts AS (
        SELECT
          fact.wind_farm_id,
          fact.field_name,
          fact.source_type,
          fact.value,
          ROW_NUMBER() OVER (
            PARTITION BY fact.wind_farm_id, fact.field_name, fact.source_type
            ORDER BY fact.created_at DESC, fact.id DESC
          ) AS rn
        FROM public.wind_farm_facts fact
        JOIN filtered_wind_farms wf
          ON wf.id = fact.wind_farm_id
        WHERE fact.status IN ('active', 'draft')
          AND fact.field_name IN ('capacity_mw', 'status', 'turbine_count')
          AND fact.source_type IN ('emodnet', 'research', 'community')
      ),
      latest_emodnet AS (
        SELECT wind_farm_id, field_name, value
        FROM ranked_facts
        WHERE source_type = 'emodnet' AND rn = 1
      ),
      latest_research AS (
        SELECT wind_farm_id, field_name, value
        FROM ranked_facts
        WHERE source_type = 'research' AND rn = 1
      ),
      latest_community AS (
        SELECT wind_farm_id, field_name, value
        FROM ranked_facts
        WHERE source_type = 'community' AND rn = 1
      )
      SELECT
        wf.id,
        wf.name,
        wf.country,
        emodnet.field_name,
        emodnet.value AS emodnet_value,
        research.value AS research_value,
        community.value AS community_value
      FROM latest_emodnet emodnet
      JOIN latest_research research
        ON research.wind_farm_id = emodnet.wind_farm_id
       AND research.field_name = emodnet.field_name
      JOIN filtered_wind_farms wf
        ON wf.id = emodnet.wind_farm_id
      LEFT JOIN latest_community community
        ON community.wind_farm_id = emodnet.wind_farm_id
       AND community.field_name = emodnet.field_name
      WHERE COALESCE(emodnet.value, '') <> COALESCE(research.value, '')
      ORDER BY COALESCE(wf.power_mw, 0) DESC, wf.id ASC, emodnet.field_name ASC
      LIMIT 25
    `,
    params,
  );

  return result.rows;
}
