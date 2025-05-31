# tmp-generator

Feasibility study for team-mirai-volunteer/fact-checker vector store auto-regeneration system.

## Usage

### Automatic Trigger (Repository Dispatch)

Vector store regeneration is automatically triggered when documents change in the policy repository. You can also manually trigger it using curl:

```bash
# Set your GitHub token and target repository
export GITHUB_TOKEN="your_personal_access_token_here"
export TARGET_REPO="your-org/your-fact-checker"  # e.g., FMs-sugiyama/tmp-generator

# Send repository dispatch event
curl -X POST \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/$TARGET_REPO/dispatches \
  -d '{"event_type":"embed","client_payload":{"sha":"master","files":"all"}}'
```

### Configuration (Repository Variables)

The system is now configurable via Repository Variables:

#### Required Variables:
- `POLICY_REPO`: Policy documents repository (e.g., `FMs-sugiyama/tmp-document`)

#### Optional Variables:
- `POLICY_BRANCH`: Default branch for policy repo (default: `master`)
- `POLICY_DIR`: Directory containing policy files (default: `policy`)
- `VECTOR_STORE_SECRET`: Secret Manager secret name (default: `VECTOR_STORE_ID`)
- `VECTOR_STORE_BACKUP_SECRET`: Backup secret name (default: `VECTOR_STORE_ID-backup`)
- `REBUILD_SCHEDULE`: Cron schedule for automatic rebuilds (default: `0 */6 * * *`)
- `SLACK_NOTIFICATIONS`: Enable Slack notifications (`true`/`false`)

#### Optional Secrets:
- `POLICY_REPO_PAT`: Personal Access Token for private policy repositories
- `SLACK_WEBHOOK_URL`: Slack webhook for notifications (when `SLACK_NOTIFICATIONS=true`)

### Check Results

After triggering, check the workflow execution at:
https://github.com/FMs-sugiyama/tmp-generator/actions

### Local Testing

```bash
# Test the upload script locally with custom source directory
bun run scripts/upload.ts --source-dir=policy

# Test fact-check functionality
bun run scripts/test-fact-check.ts

# Simulate the full workflow
./scripts/trigger-embed.sh
```

## Architecture

- **Policy Repository**: Configurable via `POLICY_REPO` variable (default: FMs-sugiyama/tmp-document)
- **Workflow**: `.github/workflows/embed.yml` - Processes documents and creates vector store
- **Scripts**: `scripts/upload.ts` - Handles document processing with configurable source directory
- **Service**: `src/lib/fact-check.ts` - Dynamic Vector Store ID retrieval with configurable secret names

## Configuration Examples

### For Team-Mirai Production:
```bash
# Set Repository Variables:
POLICY_REPO=team-mirai/policy
POLICY_BRANCH=main
VECTOR_STORE_SECRET=VECTOR_STORE_ID
SLACK_NOTIFICATIONS=true
```

### For Custom Organization:
```bash
# Set Repository Variables:
POLICY_REPO=your-org/your-policies
POLICY_BRANCH=develop
POLICY_DIR=documents
REBUILD_SCHEDULE=0 */12 * * *
```