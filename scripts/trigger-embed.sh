#!/bin/bash

# Simulation script for external repository dispatch trigger
# This simulates the trigger from 'team-mirai/policy' (FMs-sugiyama/tmp-document)

echo "=== Repository Dispatch Simulation ==="
echo "Simulating trigger from: FMs-sugiyama/tmp-document"
echo "Target: team-mirai-volunteer/fact-checker (this repo)"
echo

# Check if GitHub token is available
if [ -z "$GH_TOKEN" ]; then
    echo "WARNING: GH_TOKEN not set. This would be required for real dispatch."
    echo "For simulation, we'll just show what the command would be:"
    echo
fi

# Show the command that would trigger the workflow
echo "Command that would be executed:"
echo "curl -X POST \\"
echo "  -H \"Authorization: Bearer \$GH_TOKEN\" \\"
echo "  -H \"Accept: application/vnd.github+json\" \\"
echo "  https://api.github.com/repos/OWNER/REPO/dispatches \\"
echo "  -d '{\"event_type\":\"embed\",\"client_payload\":{\"sha\":\"main\",\"files\":\"all\"}}'"
echo

# Local simulation - just run the upload script directly
echo "=== Local Simulation ==="
echo "Running upload script locally to test functionality..."
echo

if [ -f "scripts/upload.ts" ]; then
    echo "Executing: bun run scripts/upload.ts"
    bun run scripts/upload.ts
    
    echo
    echo "=== Results ==="
    if [ -f "config/vectorStore.json" ]; then
        echo "Generated config:"
        cat config/vectorStore.json
        echo
        echo "✅ Simulation completed successfully"
    else
        echo "❌ Simulation failed - no config generated"
    fi
else
    echo "❌ upload.ts not found"
    exit 1
fi