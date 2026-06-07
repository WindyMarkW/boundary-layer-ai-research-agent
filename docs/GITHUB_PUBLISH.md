# GitHub Publish

## Local repo

From inside `boundary-layer-ai-research-agent`:

```powershell
git init
git add .
git commit -m "Initial scaffold for Supabase research agent"
```

## Create the remote repo

If you use GitHub CLI:

```powershell
gh repo create boundary-layer-ai-research-agent --private --source . --remote origin --push
```

If you prefer the GitHub UI:

1. Create an empty repo in your account
2. Copy its remote URL
3. Run:

```powershell
git remote add origin <your-repo-url>
git branch -M main
git push -u origin main
```

## Suggested settings

- Private repo to start
- Add your Hetzner deploy key or GitHub Actions key later if needed
- Add repo secrets only if you automate deployment; do not commit `.env`
