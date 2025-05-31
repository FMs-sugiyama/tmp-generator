# 🟦 Policy 変更に合わせて Vector Store を自動再生成する

> ### 🎯 ゴール
>
> - ポリシーリポジトリの Markdown が変わる、または外部から「再埋め込み」要求が来る
> - **fact-checker** の CI が新しい **OpenAI VectorStore** を作成
> - **Google Secret Manager** で Vector Store ID を更新（Blue/Green）
> - 旧 VectorStore を削除し、CLI／Web／Bot はリスタート不要で新 Store を利用

---

## 1. 全体像

```text
                                                              (外部クライアント)
(編集者) ──► policy-repo ──► GitHub repository_dispatch ◄──────────────────────
          push/PR    │                     │                    PAT / App
                     │                     │
                     │                     ▼
                     └──checkout────► fact-checker (このリポ) ── embed CI ──► OpenAI VectorStore (new)
                                            │                             ▲
                                            └─ update Secret Manager ─────┘ (リスタート不要)
```

---

## 2. 実装詳細

### 2-1. ポリシーリポジトリに置く `publish.yml`

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
          GH_TOKEN: ${{ secrets.FACT_CHECKER_PAT }} # scope: repo
          TARGET_REPO: ${{ vars.FACT_CHECKER_REPO }} # e.g., "user/fact-checker"
        run: |
          cat <<EOF | gh api repos/$TARGET_REPO/dispatches --input -
          {
            "event_type": "embed",
            "client_payload": {
              "sha": "${{ github.sha }}",
              "files": "${{ steps.diff.outputs.files }}"
            }
          }
          EOF
```

### 2-2. fact-checker の `embed.yml`

```yaml
name: Embed-and-Swap
on:
  repository_dispatch:
    types: [embed]
  schedule:
    - cron: '0 */6 * * *' # フォールバック（GitHub Actions制限により変数化不可）
  workflow_dispatch:

env:
  POLICY_REPO: ${{ vars.POLICY_REPO || 'policy-documents' }} # デフォルト: policy-documents
  VECTOR_STORE_SECRET: ${{ vars.VECTOR_STORE_SECRET || 'VECTOR_STORE_ID' }}
  VECTOR_STORE_BACKUP_SECRET: ${{ vars.VECTOR_STORE_BACKUP_SECRET || 'VECTOR_STORE_ID-backup' }}

jobs:
  embed:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write

    steps:
      - uses: actions/checkout@v4 # self
      - uses: actions/checkout@v4 # checkout policy repo at requested SHA
        with:
          repository: ${{ env.POLICY_REPO }}
          ref: ${{ github.event.client_payload.sha || vars.POLICY_BRANCH || 'main' }}
          path: policy
          token: ${{ secrets.POLICY_REPO_PAT || github.token }} # プライベートリポジトリ対応

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
          POLICY_DIR: ${{ vars.POLICY_DIR || 'policy' }} # ポリシーファイルのディレクトリ
        run: |
          # upload.tsにポリシーディレクトリを指定
          bunx tsx scripts/upload.ts --source-dir="$POLICY_DIR"
          NEW_ID=$(jq -r '.id' config/vectorStore.json)
          echo "NEW_VECTOR_STORE_ID=$NEW_ID" >> $GITHUB_ENV
          echo "New Vector Store ID: $NEW_ID"

      - name: Update Secret Manager
        run: |
          echo "$NEW_VECTOR_STORE_ID" | gcloud secrets versions add $VECTOR_STORE_SECRET --data-file=-
          echo "Updated Secret Manager with new Vector Store ID"

      - name: Delete old Vector Store
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          # 旧IDを取得して削除
          OLD_ID=$(gcloud secrets versions access latest --secret="$VECTOR_STORE_BACKUP_SECRET" 2>/dev/null || echo "")
          if [ -n "$OLD_ID" ] && [ "$OLD_ID" != "$NEW_VECTOR_STORE_ID" ]; then
            curl -X DELETE \
              -H "Authorization: Bearer $OPENAI_API_KEY" \
              -H "Content-Type: application/json" \
              "https://api.openai.com/v1/vector_stores/$OLD_ID" || echo "Failed to delete old store"
            echo "Deleted old Vector Store: $OLD_ID"
          fi
          # バックアップ用に現在のIDを保存
          echo "$NEW_VECTOR_STORE_ID" | gcloud secrets versions add $VECTOR_STORE_BACKUP_SECRET --data-file=-

      - name: Notify success
        if: success() && vars.SLACK_NOTIFICATIONS == 'true'
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
        run: |
          curl -X POST -H 'Content-type: application/json' \
            --data '{"text":":rocket: Vector Store updated successfully: '"$NEW_VECTOR_STORE_ID"'"}' \
            "$SLACK_WEBHOOK_URL"

      - name: Notify failure
        if: failure() && vars.SLACK_NOTIFICATIONS == 'true'
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
        run: |
          curl -X POST -H 'Content-type: application/json' \
            --data '{"text":":boom: Vector Store update failed. Check workflow logs."}' \
            "$SLACK_WEBHOOK_URL"
```

### 2-3. 外部トリガ（curl の例）

```bash
# 基本的な例（リポジトリは変数で指定）
curl -X POST \
  -H "Authorization: Bearer $GH_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/$TARGET_FACT_CHECKER_REPO/dispatches \
  -d '{"event_type":"embed","client_payload":{"sha":"main","files":"all"}}'

# 実際の使用例
export TARGET_FACT_CHECKER_REPO="your-org/your-fact-checker"
export GH_TOKEN="your_github_token"
export TARGET_BRANCH="main"  # または "develop", "production" など

curl -X POST \
  -H "Authorization: Bearer $GH_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/$TARGET_FACT_CHECKER_REPO/dispatches \
  -d '{"event_type":"embed","client_payload":{"sha":"'"$TARGET_BRANCH"'","files":"all"}}'
```

---

## 3. Google Cloud セットアップ

### 3-1. Secret Manager の準備

```bash
# Secret作成（設定可能な名前を使用）
gcloud secrets create $VECTOR_STORE_SECRET --data-file=-
gcloud secrets create $VECTOR_STORE_BACKUP_SECRET --data-file=-

# Cloud Runサービスアカウントに権限付与
gcloud secrets add-iam-policy-binding $VECTOR_STORE_SECRET \
  --member="serviceAccount:YOUR_SERVICE_ACCOUNT@YOUR_PROJECT.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding $VECTOR_STORE_BACKUP_SECRET \
  --member="serviceAccount:YOUR_SERVICE_ACCOUNT@YOUR_PROJECT.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### 3-2. トラブルシューティング

**422 Invalid request エラーの対処**:

- JSON ペイロードが文字列として送信される問題
- heredoc + `--input -` を使用して JSON オブジェクトとして送信

**403 Forbidden エラーの対処**:

- Fine-grained token で対象リポジトリが明示的に選択されていることを確認
- Repository permissions で適切な権限が設定されていることを確認

### 3-3. 環境変数の更新

Cloud Run デプロイ時：

```bash
gcloud run deploy your-fact-checker \
  --image "$IMAGE" \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --set-env-vars="NODE_ENV=production,GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID" \
  --update-secrets="OPENAI_API_KEY=OPENAI_API_KEY:latest,..."
```

---

## 4. 実装時の注意点

### 4-1. `src/lib/fact-check.ts` の改修

Vector Store ID を動的取得するように変更：

```typescript
import { SecretManagerServiceClient } from '@google-cloud/secret-manager'

// Google Secret Managerから動的にVector Store IDを取得
async function getVectorStoreId(): Promise<string> {
  if (process.env.NODE_ENV === 'production') {
    const client = new SecretManagerServiceClient()
    const projectId = process.env.GOOGLE_CLOUD_PROJECT
    const secretName = process.env.VECTOR_STORE_SECRET || 'VECTOR_STORE_ID'
    const [version] = await client.accessSecretVersion({
      name: `projects/${projectId}/secrets/${secretName}/versions/latest`,
    })
    return version.payload?.data?.toString() || ''
  } else {
    return (
      process.env.VECTOR_STORE_ID ??
      (() => {
        throw new Error('VECTOR_STORE_ID is not set')
      })()
    )
  }
}

// factCheck関数内で動的に取得
export async function factCheck(statement: string): Promise<CheckResult> {
  const vectorStoreId = await getVectorStoreId()
  // ... 以下既存のロジック
}
```

### 4-2. 依存関係の追加

```bash
bun add @google-cloud/secret-manager
```

### 4-3. `scripts/upload.ts` の改修例

ポリシーディレクトリを動的に指定できるように：

```typescript
// コマンドライン引数からソースディレクトリを取得
const args = process.argv.slice(2)
const sourceDirFlag = args.find((arg) => arg.startsWith('--source-dir='))
const sourceDir = sourceDirFlag ? sourceDirFlag.split('=')[1] : 'policy'

console.log(`Using source directory: ${sourceDir}`)

// 既存のupload.tsロジックでsourceDirを使用
// ...
```

---

## 5. 実装タスク一覧

**ポリシーリポジトリ側**:
• `publish.yml` 追加
• Repository Variables: `FACT_CHECKER_REPO` 設定
• Repository Secrets: Fine-grained PAT (`FACT_CHECKER_PAT`) 登録

- Repository access: Selected repositories で対象 fact-checker リポジトリを追加
- Repository permissions: Contents: Write, Metadata: Read を設定

**fact-checker リポジトリ側**:
• `embed.yml` 追加
• `fact-check.ts` および `upload.ts` 改修
• 依存関係追加
• Repository Variables 設定:

- `POLICY_REPO`: ポリシードキュメントリポジトリ名
- その他オプション変数（必要に応じて）
  • Repository Secrets 設定:
- `OPENAI_API_KEY`: OpenAI API キー
- 条件付きシークレット（使用する機能に応じて）

**Google Cloud**:
• Secret Manager 設定・サービスアカウント権限設定
• CI Secrets: `GCLOUD_SERVICE_KEY` `PROJECT_ID` を fact-checker に追加

**通知設定**:
• Slack webhook URL 設定（使用時のみ）

**ドキュメント**:
• README を新フロー・設定手順に更新

---

## 6. Acceptance Criteria

• ポリシーリポジトリを更新すると fact-checker の CI が走り、新 VectorStore が作られる  
• Google Secret Manager で Vector Store ID が更新される  
• CLI / Web / Slack bot が**リスタート不要**で新 Store を参照する  
• 旧 Store が自動削除される  
• 成否が Slack に通知される (:rocket: / :boom:) ※通知有効時のみ
• ファクトチェック機能が中断されることなく継続動作する
• **汎用性**: 任意のポリシーリポジトリと fact-checker リポジトリの組み合わせで動作する
• **設定の外部化**: ハードコードされた値がなく、すべて環境変数・Repository Variables で制御可能
