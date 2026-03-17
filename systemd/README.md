# Iris systemd setup

`iris-bot` を Ubuntu 上で `systemd` 管理の常駐プロセスとして動かす手順です。

## 前提

- Ubuntu サーバーを使う
- `bun 1.3.10` を利用できる
- Discord Bot の `DISCORD_TOKEN` と `DISCORD_APPLICATION_ID` を取得済み
- アプリ配置先を `/opt/iris-bot`、環境変数ファイルを `/etc/iris-bot/iris-bot.env`、SQLite を `/var/lib/iris-bot/iris.db` とする

## ツール管理

`iris-bot` は Bun 一本で動かします。Ubuntu では `proto` 前提を推奨します。

```bash
proto install bun 1.3.10
proto pin bun 1.3.10 --resolve
```

このリポジトリには `.prototools` も同梱しています。

## 1. 実行ユーザーと保存先を作成

```bash
sudo useradd --system --create-home --home-dir /opt/iris-bot --shell /usr/sbin/nologin iris
sudo mkdir -p /etc/iris-bot /var/lib/iris-bot
sudo chown -R iris:iris /opt/iris-bot /var/lib/iris-bot
```

## 2. アプリを配置

まだ配置していない場合:

```bash
sudo -u iris git clone https://github.com/ozekimasaki/iris_bot /opt/iris-bot
```

## 3. 依存関係を入れる

```bash
sudo -u iris bash -lc 'cd /opt/iris-bot && /opt/iris-bot/.proto/bin/proto exec bun -- bun install'
```

## 4. 環境変数ファイルを作成

```bash
sudo tee /etc/iris-bot/iris-bot.env > /dev/null <<'EOF'
DISCORD_TOKEN=your-discord-bot-token
DISCORD_APPLICATION_ID=123456789012345678
DATABASE_PATH=/var/lib/iris-bot/iris.db
LOG_LEVEL=info
EOF

sudo chown root:iris /etc/iris-bot/iris-bot.env
sudo chmod 640 /etc/iris-bot/iris-bot.env
```

## 5. 初回コマンド同期

```bash
sudo -u iris bash -lc 'set -a; source /etc/iris-bot/iris-bot.env; set +a; cd /opt/iris-bot; /opt/iris-bot/.proto/bin/proto exec bun -- bun run commands:sync'
```

特定ギルドだけなら:

```bash
sudo -u iris bash -lc 'set -a; source /etc/iris-bot/iris-bot.env; set +a; cd /opt/iris-bot; /opt/iris-bot/.proto/bin/proto exec bun -- bun run commands:sync -- --guild <guild-id>'
```

## 6. systemd サービスを登録

同梱の `systemd/iris-bot.service` は `proto exec bun` 前提です。

```bash
sudo cp /opt/iris-bot/systemd/iris-bot.service /etc/systemd/system/iris-bot.service
sudo systemctl daemon-reload
sudo systemctl enable --now iris-bot
```

## 7. 状態確認

```bash
sudo systemctl status iris-bot
sudo journalctl -u iris-bot -f
```

## 更新手順

```bash
sudo -u iris bash -lc 'cd /opt/iris-bot && git pull --ff-only && /opt/iris-bot/.proto/bin/proto exec bun -- bun install'
sudo systemctl restart iris-bot
```

コマンド定義を変えた場合や Bot を新しいギルドに招待した場合は、更新後に `bun run commands:sync` も実行してください。

詳細は [systemd/UPDATE.md](/C:/Users/masam/Documents/server_admin_bot/iris-bot/systemd/UPDATE.md) を参照してください。

## よく使う操作

```bash
sudo systemctl start iris-bot
sudo systemctl stop iris-bot
sudo systemctl restart iris-bot
sudo journalctl -u iris-bot -n 200
```

## トラブルシュート

- `.env` を更新しただけでは反映されないため、更新後は `sudo systemctl restart iris-bot` を実行する
- `DATABASE_PATH` の親ディレクトリに `iris` ユーザーの書き込み権限が必要
- `proto` 利用時に `/opt/iris-bot/.proto/bin/proto` が見つからない場合は、`iris` ユーザーで `/opt/iris-bot` 配下の `proto install bun 1.3.10` をやり直す
- 起動失敗時は `sudo journalctl -u iris-bot -b` で当該ブートのログを確認する
