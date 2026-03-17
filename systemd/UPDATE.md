# Iris Ubuntu Update Guide

Ubuntu 上で `systemd` 管理されている `iris-bot` を更新する手順です。すでに次の前提で動いている構成を対象にしています。

- アプリ配置先: `/opt/iris-bot`
- サービス名: `iris-bot`
- 環境変数ファイル: `/etc/iris-bot/iris-bot.env`
- SQLite: `/var/lib/iris-bot/iris.db`
- Bun 実行: `/opt/iris-bot/.proto/bin/proto exec bun -- ...`

## 最短手順

通常のコード更新だけなら、次の 4 ステップで十分です。

```bash
sudo -u iris bash -lc 'cd /opt/iris-bot && git pull --ff-only && /opt/iris-bot/.proto/bin/proto exec bun -- bun install'
sudo systemctl restart iris-bot
sudo systemctl status iris-bot --no-pager
sudo journalctl -u iris-bot -n 100 --no-pager
```

Slash Command 定義を変えた更新なら、再起動後に追加でこれも実行します。

```bash
sudo -u iris bash -lc 'set -a; source /etc/iris-bot/iris-bot.env; set +a; cd /opt/iris-bot; /opt/iris-bot/.proto/bin/proto exec bun -- bun run commands:sync'
```

## 推奨更新フロー

### 1. 現在の状態を確認

```bash
sudo systemctl status iris-bot --no-pager
sudo journalctl -u iris-bot -n 50 --no-pager
sudo -u iris bash -lc 'cd /opt/iris-bot && git rev-parse --short HEAD'
```

更新前からエラーが出ていないかを先に見ておくと、更新起因の障害か切り分けやすくなります。

### 2. 変更を取り込む

```bash
sudo -u iris bash -lc 'cd /opt/iris-bot && git fetch --all --prune'
sudo -u iris bash -lc 'cd /opt/iris-bot && git status --short'
sudo -u iris bash -lc 'cd /opt/iris-bot && git pull --ff-only'
```

`git status --short` で差分が出た場合は、そのサーバー上で手修正が入っている可能性があります。そのまま進めず、内容を確認してから更新してください。

### 3. 依存関係を更新

```bash
sudo -u iris bash -lc 'cd /opt/iris-bot && /opt/iris-bot/.proto/bin/proto exec bun -- bun install'
```

`bun.lock` に追従して依存関係を揃えます。

### 4. 必要なら環境変数を更新

`.env` 相当を変更する場合は `/etc/iris-bot/iris-bot.env` を更新します。環境変数の変更は再起動しないと反映されません。

### 5. 必要なら Slash Command を同期

次のような変更があるときだけ実行してください。

- `src/commands/` 配下を変更した
- コマンド説明やオプションを変更した
- Bot を新しいギルドに追加した

```bash
sudo -u iris bash -lc 'set -a; source /etc/iris-bot/iris-bot.env; set +a; cd /opt/iris-bot; /opt/iris-bot/.proto/bin/proto exec bun -- bun run commands:sync'
```

特定ギルドだけに反映したい場合:

```bash
sudo -u iris bash -lc 'set -a; source /etc/iris-bot/iris-bot.env; set +a; cd /opt/iris-bot; /opt/iris-bot/.proto/bin/proto exec bun -- bun run commands:sync -- --guild <guild-id>'
```

### 6. 必要なら systemd ユニットを更新

`systemd/iris-bot.service` を変更した更新なら、サービス定義も反映します。

```bash
sudo cp /opt/iris-bot/systemd/iris-bot.service /etc/systemd/system/iris-bot.service
sudo systemctl daemon-reload
```

### 7. Bot を再起動

```bash
sudo systemctl restart iris-bot
```

### 8. 起動確認

```bash
sudo systemctl status iris-bot --no-pager
sudo journalctl -u iris-bot -n 100 --no-pager
```

追いかけて見る場合:

```bash
sudo journalctl -u iris-bot -f
```

## よくある更新パターン

### コードだけ変わった

`git pull --ff-only` → `bun install` → `systemctl restart`

### コマンド定義も変わった

`git pull --ff-only` → `bun install` → `commands:sync` → `systemctl restart`

### 環境変数も変えた

`git pull --ff-only` → `bun install` → `/etc/iris-bot/iris-bot.env` 更新 → `systemctl restart`

### systemd サービス定義も変わった

`git pull --ff-only` → `bun install` → サービスファイルコピー → `daemon-reload` → `systemctl restart`

## 問題が出たときの確認ポイント

- `sudo journalctl -u iris-bot -b --no-pager`
- `sudo systemctl status iris-bot --no-pager`
- `/etc/iris-bot/iris-bot.env` の値が正しいか
- `/var/lib/iris-bot/iris.db` とその親ディレクトリに `iris` ユーザーの書き込み権限があるか
- `/opt/iris-bot/.proto/bin/proto` が存在するか

## 補足

- SQL migration は `bun run db:migrate` と通常起動の両方で適用されるため、通常の更新では `db:migrate` を別途実行しなくても動きます
- ただし、起動前に migration を明示実行したい場合は次を使えます

```bash
sudo -u iris bash -lc 'set -a; source /etc/iris-bot/iris-bot.env; set +a; cd /opt/iris-bot; /opt/iris-bot/.proto/bin/proto exec bun -- bun run db:migrate'
```
