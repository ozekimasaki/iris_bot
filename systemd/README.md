# Iris systemd setup

`iris-bot` を Ubuntu 上で `systemd` 管理の常駐プロセスとして動かす手順です。

## 前提

- Ubuntu サーバーを使う
- `Node.js 24 LTS` と `pnpm 10+` を system-wide にインストール済み
- Discord Bot の `DISCORD_TOKEN` と `DISCORD_APPLICATION_ID` を取得済み
- アプリ配置先を `/opt/iris-bot`、環境変数ファイルを `/etc/iris-bot/iris-bot.env`、SQLite を `/var/lib/iris-bot/iris.db` とする

`systemd/iris-bot.service` は `/usr/bin/node` を参照するため、`nvm` 専用構成のままだと動かないことがあります。

## proto を使う場合

`iris-bot` は Bun 実行ではなく、`Node.js 24 + pnpm` 前提です。Ubuntu 環境で `proto` を使っている場合も、`bun` ではなく `node` と `pnpm` を `proto` で入れて起動してください。

`proto setup` はシェルの profile に PATH を追加する方式なので、`systemd` ではそのまま効かないことがあります。そのため、サービスファイルでは `node` や `pnpm` を素のコマンド名で呼ぶより、`proto` を絶対パスで呼ぶ方が安全です。

例:

```bash
proto install node 24
proto install pnpm 10
proto pin node 24 --resolve
proto pin pnpm 10 --resolve
```

このリポジトリ直下に `.prototools` を置く場合の例:

```toml
node = "24"
pnpm = "10"
```

`systemd` で `proto` を使う場合は、`ExecStart` を以下のように変更します。

```ini
ExecStart=/home/iris/.proto/bin/proto exec node -- node --disable-warning=ExperimentalWarning /opt/iris-bot/dist/index.js
```

この場合、ビルドや依存インストールも同様に `proto exec` 経由にします。

```bash
sudo -u iris bash -lc 'cd /opt/iris-bot && ~/.proto/bin/proto exec node pnpm -- pnpm install --frozen-lockfile && ~/.proto/bin/proto exec node pnpm -- pnpm build'
```

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

すでに配置済みならこの手順は不要です。

## 3. 依存関係を入れてビルド

```bash
sudo -u iris bash -lc 'cd /opt/iris-bot && pnpm install --frozen-lockfile && pnpm build'
```

`systemd` は `dist/index.js` を起動するため、`pnpm build` が必要です。

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

Slash command を Discord に反映します。

```bash
sudo -u iris bash -lc 'set -a; source /etc/iris-bot/iris-bot.env; set +a; cd /opt/iris-bot; pnpm commands:sync'
```

特定ギルドだけなら:

```bash
sudo -u iris bash -lc 'set -a; source /etc/iris-bot/iris-bot.env; set +a; cd /opt/iris-bot; pnpm commands:sync --guild <guild-id>'
```

## 6. systemd サービスを登録

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

自動起動設定を確認する場合:

```bash
sudo systemctl is-enabled iris-bot
```

## 更新手順

```bash
sudo -u iris bash -lc 'cd /opt/iris-bot && git pull && pnpm install --frozen-lockfile && pnpm build'
sudo systemctl restart iris-bot
```

コマンド定義を変えた場合や Bot を新しいギルドに招待した場合は、更新後に `pnpm commands:sync` も実行してください。

## よく使う操作

起動:

```bash
sudo systemctl start iris-bot
```

停止:

```bash
sudo systemctl stop iris-bot
```

再起動:

```bash
sudo systemctl restart iris-bot
```

ログ確認:

```bash
sudo journalctl -u iris-bot -n 200
```

## トラブルシュート

- `ExecStart` の `/usr/bin/node` が存在しない場合は、`which node` で実パスを確認して `systemd/iris-bot.service` を修正する
- `proto` 管理のランタイムを使う場合は、`/usr/bin/node` 参照をやめて `~/.proto/bin/proto exec ...` に変える
- `.env` を更新しただけでは反映されないため、更新後は `sudo systemctl restart iris-bot` を実行する
- `DATABASE_PATH` の親ディレクトリに `iris` ユーザーの書き込み権限が必要
- 起動失敗時は `sudo journalctl -u iris-bot -b` で当該ブートのログを確認する
