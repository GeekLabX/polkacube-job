# PolkaCube Job

> Polkadot network staking monitor job. Must setup nodejs, yarn, pm2, polkadot node (kusama) and mysql database, then modify .env configuration.

## setup polkadot node

```bash
docker run parity/polkadot --pruning "archive" --name "name on telemetry"
```

## setup database

```bash
mysql -u root -p'your_mysql_root_password';
> create database polkacube;
> use polkacube;
> source ./sql/polkacube.sql;
```

## build

```bash
yarn install
```

## start

```bash
pm2 start index.js --name cube-job --no-daemon --restart-delay 10000
pm2 ls
tail -f ~/.pm2/logs/cube-job-out.log
tail -f ~/.pm2/logs/cube-job-error.log
```

## stop

```bash
pm2 stop [pm2 id]
```

## The Docker Way

> Run a polkadot node first.
> Use the right configure in `.env` file

```bash
docker build -t polkacube_job .
docker run -d -v [LOG_DIR]:/root/.pm2/logs polkacube_job
```
