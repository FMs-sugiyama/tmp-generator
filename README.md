# tmp-generator

team-mirai-volunteer/fact-checker ベクターストア自動再生成システムのフィージビリティスタディ

## 📋 概要

このシステムは、ポリシードキュメントが変更された際に自動的にOpenAI Vector Storeを再生成する機能を提供します。

## 🚀 使用方法

### 自動トリガー（Repository Dispatch）

ポリシーリポジトリでドキュメントが変更されると自動的にベクターストアの再生成がトリガーされます。手動でトリガーすることも可能です：

```bash
# GitHubトークンとターゲットリポジトリを設定
export GITHUB_TOKEN="your_personal_access_token_here"
export TARGET_REPO="your-org/your-fact-checker"  # 例: FMs-sugiyama/tmp-generator

# Repository Dispatchイベントを送信
curl -X POST \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/$TARGET_REPO/dispatches \
  -d '{"event_type":"embed","client_payload":{"sha":"master","files":"all"}}'
```

## ⚙️ 設定方法

### 🔴 必須設定

システムを動作させるために**必ず設定が必要**な項目：

#### Repository Variables（リポジトリ変数）:
- `POLICY_REPO`: ポリシードキュメントのリポジトリ名（例: `FMs-sugiyama/tmp-document`）

### 🟡 オプション設定

#### Repository Variables（リポジトリ変数）:
- `POLICY_BRANCH`: ポリシーリポジトリのブランチ名（デフォルト: `master`）
- `POLICY_DIR`: ポリシーファイルが格納されているディレクトリ名（デフォルト: `policy`）
- `VECTOR_STORE_SECRET`: Secret Managerのシークレット名（デフォルト: `VECTOR_STORE_ID`）
- `VECTOR_STORE_BACKUP_SECRET`: バックアップシークレット名（デフォルト: `VECTOR_STORE_ID-backup`）
- `REBUILD_SCHEDULE`: 自動リビルドのCronスケジュール（デフォルト: `0 */6 * * *`）
- `SLACK_NOTIFICATIONS`: Slack通知の有効/無効（`true`/`false`、デフォルト: 無効）

#### Repository Secrets（リポジトリシークレット）:
- `POLICY_REPO_PAT`: プライベートポリシーリポジトリアクセス用Personal Access Token
- `SLACK_WEBHOOK_URL`: Slack通知用Webhook URL（`SLACK_NOTIFICATIONS=true`の場合のみ必要）

## 🛠️ 設定手順

### 手順1: GitHubリポジトリの設定画面を開く

1. あなたのリポジトリのページに移動
2. **Settings**タブをクリック
3. 左サイドバーの**Secrets and variables**をクリック
4. **Actions**をクリック

### 手順2: Repository Variables（リポジトリ変数）を設定

1. **Variables**タブをクリック
2. **New repository variable**ボタンをクリック
3. 以下の変数を一つずつ追加：

#### 🔴 必須設定:
```
Name: POLICY_REPO
Value: FMs-sugiyama/tmp-document
```

#### 🟡 オプション設定（必要に応じて）:
```
Name: POLICY_BRANCH
Value: master

Name: POLICY_DIR  
Value: policy

Name: VECTOR_STORE_SECRET
Value: VECTOR_STORE_ID

Name: VECTOR_STORE_BACKUP_SECRET
Value: VECTOR_STORE_ID-backup

Name: REBUILD_SCHEDULE
Value: 0 */6 * * *

Name: SLACK_NOTIFICATIONS
Value: false
```

### 手順3: Repository Secrets（リポジトリシークレット）を設定（オプション）

1. **Secrets**タブをクリック
2. **New repository secret**ボタンをクリック
3. 必要に応じて以下のシークレットを追加：

#### プライベートリポジトリを使用する場合:
```
Name: POLICY_REPO_PAT
Value: github_pat_11ABC123...
```

#### Slack通知を有効にする場合:
```
Name: SLACK_WEBHOOK_URL
Value: https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX
```

## 📖 設定例

### 最小設定（基本動作のみ）:
```
Repository Variables:
POLICY_REPO=YOUR_ORG/YOUR_POLICY_REPO
```

### Team-Mirai本番用設定:
```
Repository Variables:
POLICY_REPO=team-mirai/policy
POLICY_BRANCH=main
VECTOR_STORE_SECRET=VECTOR_STORE_ID
SLACK_NOTIFICATIONS=true

Repository Secrets:
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
```

### カスタム組織用設定:
```
Repository Variables:
POLICY_REPO=your-org/your-policies
POLICY_BRANCH=develop
POLICY_DIR=documents
REBUILD_SCHEDULE=0 */12 * * *
SLACK_NOTIFICATIONS=true

Repository Secrets:
POLICY_REPO_PAT=github_pat_11ABC123...
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
```

## 🔍 動作確認

### 実行結果の確認

トリガー後、以下のURLでワークフローの実行状況を確認できます:
https://github.com/FMs-sugiyama/tmp-generator/actions

### ローカルテスト

```bash
# カスタムソースディレクトリでアップロードスクリプトをテスト
bun run scripts/upload.ts --source-dir=policy

# ファクトチェック機能をテスト
bun run scripts/test-fact-check.ts

# フルワークフローをシミュレート
./scripts/trigger-embed.sh
```

## 🏗️ アーキテクチャ

- **ポリシーリポジトリ**: `POLICY_REPO`変数で設定可能（デフォルト: FMs-sugiyama/tmp-document）
- **ワークフロー**: `.github/workflows/embed.yml` - ドキュメント処理とベクターストア作成
- **スクリプト**: `scripts/upload.ts` - 設定可能なソースディレクトリでのドキュメント処理
- **サービス**: `src/lib/fact-check.ts` - 設定可能なシークレット名での動的Vector Store ID取得

## ❓ よくある質問

### Q: 最低限何を設定すれば動きますか？
A: `POLICY_REPO`変数のみ設定すれば基本機能が動作します。

### Q: プライベートリポジトリは使えますか？
A: はい。`POLICY_REPO_PAT`シークレットにPersonal Access Tokenを設定してください。

### Q: Slack通知を無効にできますか？
A: はい。`SLACK_NOTIFICATIONS`変数を設定しないか、`false`に設定してください。

### Q: 設定を変更した後、何か再起動が必要ですか？
A: いいえ。設定変更は次回のワークフロー実行時に自動的に反映されます。