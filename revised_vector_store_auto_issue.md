# 🟦 Policy 変更に合わせて Vector Store を自動再生成する

> ### 🎯 ゴール  
> * `team-mirai/policy` の Markdown が変わる、または外部から「再埋め込み」要求が来る  
> * **fact-checker** の CI が新しい **OpenAI VectorStore** を作成  
> * **Google Secret Manager** で Vector Store ID を更新（Blue/Green）  
> * 旧 VectorStore を削除し、CLI／Web／Bot はリスタート不要で新 Store を利用  

---

## 1. 全体像

```text
                                                              (外部クライアント)
(編集者) ──► team-mirai/policy ──► GitHub repository_dispatch ◄─────────────────
          push/PR      │                     │                    PAT / App       
                       │                     │                                  
                       │                     ▼                                  
                       └──checkout────► fact-checker (このリポ) ── embed CI ──► OpenAI VectorStore (new)           
                                              │                             ▲                          
                                              └─ update Secret Manager ─────┘ (リスタート不要)         
```

---

## 2. 実装詳細

### 2-1. `team-mirai/policy` に置く `publish.yml`

```yaml
name: Fire-Vector-Rebuild
on:
  push:
    paths: ['**/*.md']

jobs:
  dispatch:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - id: diff
        run: |
          echo "files=$(git diff --name-only ${{ github.event.before }}...${{ github.sha }} \
            | tr '\n' ',')" >> "$GITHUB_OUTPUT"
      - name: Send repository_dispatch
        env:
          GH_TOKEN: ${{ secrets.FACT_CHECKER_PAT }}   # scope: repo
        run: |
          gh api repos/team-mirai-volunteer/fact-checker/dispatches \
            -F event_type=embed \
            -F client_payload="{\"sha\":\"${{ github.sha }}\",\"files\":\"${{ steps.diff.outputs.files }}\"}"
```

### 2-2. `fact-checker` の `embed.yml`

```yaml
name: Embed-and-Swap
on:
  repository_dispatch:
    types: [embed]
  schedule:
    - cron: '0 */6 * * *'     # フォールバック
  workflow_dispatch:

jobs:
  embed:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    
    steps:
      - uses: actions/checkout@v4    # self
      - uses: actions/checkout@v4    # checkout policy repo at requested SHA
        with:
          repository: team-mirai/policy
          ref: ${{ github.event.client_payload.sha || 'main' }}
          path: policy
      
      - uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCLOUD_SERVICE_KEY }}
          project_id: ${{ secrets.PROJECT_ID }}
      
      - uses: google-github-actions/setup-gcloud@v2
      
      - name: Setup Bun
        uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest
      
      - name: Install dependencies
        run: bun install
      
      - name: Create new Vector Store
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          # 既存のupload.tsを活用
          bunx tsx scripts/upload.ts
          NEW_ID=$(jq -r '.id' config/vectorStore.json)
          echo "NEW_VECTOR_STORE_ID=$NEW_ID" >> $GITHUB_ENV
          echo "New Vector Store ID: $NEW_ID"
      
      - name: Update Secret Manager
        run: |
          echo "$NEW_VECTOR_STORE_ID" | gcloud secrets versions add VECTOR_STORE_ID --data-file=-
          echo "Updated Secret Manager with new Vector Store ID"
      
      - name: Delete old Vector Store
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          # 旧IDを取得して削除
          OLD_ID=$(gcloud secrets versions access latest --secret="VECTOR_STORE_ID-backup" 2>/dev/null || echo "")
          if [ -n "$OLD_ID" ] && [ "$OLD_ID" != "$NEW_VECTOR_STORE_ID" ]; then
            curl -X DELETE \
              -H "Authorization: Bearer $OPENAI_API_KEY" \
              -H "Content-Type: application/json" \
              "https://api.openai.com/v1/vector_stores/$OLD_ID" || echo "Failed to delete old store"
            echo "Deleted old Vector Store: $OLD_ID"
          fi
          # バックアップ用に現在のIDを保存
          echo "$NEW_VECTOR_STORE_ID" | gcloud secrets versions add VECTOR_STORE_ID-backup --data-file=-
      
      - name: Notify success
        if: success()
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
        run: |
          curl -X POST -H 'Content-type: application/json' \
            --data '{"text":":rocket: Vector Store updated successfully: '"$NEW_VECTOR_STORE_ID"'"}' \
            "$SLACK_WEBHOOK_URL"
      
      - name: Notify failure
        if: failure()
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
        run: |
          curl -X POST -H 'Content-type: application/json' \
            --data '{"text":":boom: Vector Store update failed. Check workflow logs."}' \
            "$SLACK_WEBHOOK_URL"
```

### 2-3. 外部トリガ（curl の例）

```bash
curl -X POST \
  -H "Authorization: Bearer $GH_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/team-mirai-volunteer/fact-checker/dispatches \
  -d '{"event_type":"embed","client_payload":{"sha":"main","files":"all"}}'
```

---

## 3. Google Cloud セットアップ

### 3-1. Secret Manager の準備

```bash
# Secret作成
gcloud secrets create VECTOR_STORE_ID --data-file=-
gcloud secrets create VECTOR_STORE_ID-backup --data-file=-

# Cloud Runサービスアカウントに権限付与
gcloud secrets add-iam-policy-binding VECTOR_STORE_ID \
  --member="serviceAccount:YOUR_SERVICE_ACCOUNT@YOUR_PROJECT.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding VECTOR_STORE_ID-backup \
  --member="serviceAccount:YOUR_SERVICE_ACCOUNT@YOUR_PROJECT.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### 3-2. 環境変数の更新

Cloud Runデプロイ時：

```bash
gcloud run deploy x-fact-checker \
  --image "$IMAGE" \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --set-env-vars="NODE_ENV=production,GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID" \
  --update-secrets="OPENAI_API_KEY=OPENAI_API_KEY:latest,..."
```

---

## 4. 実装時の注意点

### 4-1. `src/lib/fact-check.ts` の改修

Vector Store IDを動的取得するように変更：

```typescript
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

// Google Secret Managerから動的にVector Store IDを取得
async function getVectorStoreId(): Promise<string> {
  if (process.env.NODE_ENV === 'production') {
    const client = new SecretManagerServiceClient();
    const projectId = process.env.GOOGLE_CLOUD_PROJECT;
    const [version] = await client.accessSecretVersion({
      name: `projects/${projectId}/secrets/VECTOR_STORE_ID/versions/latest`
    });
    return version.payload?.data?.toString() || '';
  } else {
    return process.env.VECTOR_STORE_ID ?? (() => {
      throw new Error("VECTOR_STORE_ID is not set");
    })();
  }
}

// factCheck関数内で動的に取得
export async function factCheck(statement: string): Promise<CheckResult> {
  const vectorStoreId = await getVectorStoreId();
  // ... 以下既存のロジック
}
```

### 4-2. 依存関係の追加

```bash
bun add @google-cloud/secret-manager
```

---

## 5. 実装タスク一覧

• **policy-repo**: `publish.yml` 追加・PAT (`FACT_CHECKER_PAT`) 登録
• **fact-checker**: `embed.yml` + `fact-check.ts` 改修 + 依存関係追加
• **Google Cloud**: Secret Manager設定・サービスアカウント権限設定
• **CI Secrets**: `GCLOUD_SERVICE_KEY` `PROJECT_ID` を fact-checker に追加
• **通知**: Slack webhook URL設定
• **ドキュメント**: README を新フローに更新

---

## 6. Acceptance Criteria

• `policy-repo` を更新すると fact-checker の CI が走り、新 VectorStore が作られる  
• Google Secret Manager で Vector Store ID が更新される  
• CLI / Web / Slack bot が**リスタート不要**で新 Store を参照する  
• 旧 Store が自動削除される  
• 成否が Slack に通知される (:rocket: / :boom:)
• ファクトチェック機能が中断されることなく継続動作する