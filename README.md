# PolkaCube Job

> Polkadot network staking monitor job. 

## Development

### Prerequisites

Must setup nodejs, yarn, pm2, polkadot node (kusama) and mysql database  
Modify .env configuration.

### Setup polkadot node

```bash
docker run parity/polkadot --pruning "archive" --name "name on telemetry"
```

### Setup database

```bash
mysql -u root -p'your_mysql_root_password';
> create database polkacube;
> use polkacube;
> source ./sql/polkacube.sql;
```

### Build

```bash
yarn install
```

### Start

```bash
pm2 start index.js --name cube-job --no-daemon --restart-delay 10000
pm2 ls
tail -f ~/.pm2/logs/cube-job-out.log
tail -f ~/.pm2/logs/cube-job-error.log
```

### Stop

```bash
pm2 stop [pm2 id]
```

## Docker Image

Run a polkadot node first.  
Modify `.env` file  

```bash
docker build -t polkacube_job .
docker run -d -v [LOG_DIR]:/root/.pm2/logs polkacube_job
```

## License

[Apache-2.0](LICENSE)
