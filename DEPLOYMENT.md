# Deployment Guide - Prompt Harvester

This guide covers deploying Prompt Harvester to production environments.

## Quick Deploy with Docker Compose

The easiest way to deploy all services:

```bash
# Clone repository
git clone https://github.com/yourusername/prompt-harvester.git
cd prompt-harvester

# Create .env file
cp .env.example .env
# Edit .env with your configuration

# Start all services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f
```

Services will be available at:
- API Server: http://localhost:3000
- Dashboard: http://localhost:5173
- Qdrant: http://localhost:6333
- PostgreSQL: localhost:5432

## Manual Deployment

### 1. Database Setup

```bash
# Install PostgreSQL 15+
sudo apt-get install postgresql-15

# Create database
sudo -u postgres createdb prompt_harvester

# Load schema
psql -U postgres -d prompt_harvester -f schema.sql

# Verify
psql -U postgres -d prompt_harvester -c "\dt"
```

### 2. Qdrant Setup

```bash
# Docker installation (recommended)
docker run -d -p 6333:6333 -p 6334:6334 \
  -v $(pwd)/qdrant_storage:/qdrant/storage:z \
  --name qdrant \
  qdrant/qdrant

# Or native installation
wget https://github.com/qdrant/qdrant/releases/download/v1.7.4/qdrant-x86_64-unknown-linux-gnu.tar.gz
tar -xzf qdrant-x86_64-unknown-linux-gnu.tar.gz
./qdrant
```

### 3. API Server Deployment

```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash

# Install dependencies
bun install

# Set environment variables
export DATABASE_URL="postgresql://user:pass@localhost/prompt_harvester"
export QDRANT_URL="http://localhost:6333"
export EMBEDDING_MODE="local" # or "cloud"
export OPENAI_API_KEY="sk-..." # if using cloud mode

# Start server
bun run api-server.ts

# Or with PM2 for production
npm install -g pm2
pm2 start api-server.ts --interpreter bun --name prompt-harvester-api
pm2 save
pm2 startup
```

### 4. Dashboard Deployment

```bash
cd dashboard

# Install dependencies
npm install

# Build for production
npm run build

# Serve with Node
node build/index.js

# Or with PM2
pm2 start build/index.js --name prompt-harvester-dashboard
```

### 5. Setup Automated Tasks

```bash
# Make scripts executable
chmod +x src/scripts/setup-cron.sh
chmod +x src/scripts/backup-automated.ts

# Run setup
./src/scripts/setup-cron.sh

# Manually verify
crontab -l
```

## Cloud Deployment Options

### Option 1: Railway

1. Push to GitHub
2. Connect repository to Railway
3. Add PostgreSQL and Redis add-ons
4. Deploy Qdrant as separate service
5. Set environment variables
6. Deploy!

### Option 2: Fly.io

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Initialize app
fly launch

# Add PostgreSQL
fly postgres create

# Deploy
fly deploy
```

### Option 3: DigitalOcean App Platform

1. Connect GitHub repository
2. Configure build settings:
   - Build Command: `bun install && cd dashboard && npm install && npm run build`
   - Run Command: `bun run api-server.ts`
3. Add PostgreSQL database
4. Deploy Qdrant on a Droplet
5. Configure environment variables

### Option 4: AWS (Production)

#### ECS Fargate Deployment

```bash
# Build and push Docker images
docker build -t prompt-harvester-api .
docker tag prompt-harvester-api:latest ${ECR_REPO}/prompt-harvester-api:latest
docker push ${ECR_REPO}/prompt-harvester-api:latest

# Create ECS task definition
aws ecs register-task-definition --cli-input-json file://ecs-task-def.json

# Create ECS service
aws ecs create-service \
  --cluster prompt-harvester-cluster \
  --service-name prompt-harvester-api \
  --task-definition prompt-harvester-api:1 \
  --desired-count 2 \
  --launch-type FARGATE
```

## Environment Variables

Required variables for production:

```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/prompt_harvester

# Qdrant
QDRANT_URL=http://qdrant-host:6333
QDRANT_API_KEY=optional_api_key

# Embeddings
EMBEDDING_MODE=cloud  # or local
OPENAI_API_KEY=sk-...  # if cloud mode

# R2 Storage (optional)
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY=your_access_key
R2_SECRET_KEY=your_secret_key
R2_BUCKET_NAME=prompt-harvester

# Backups
BACKUP_PATH=/backups
BACKUP_RETENTION_DAILY=7
BACKUP_RETENTION_WEEKLY=4
BACKUP_RETENTION_MONTHLY=12

# API
API_PORT=3000
API_HOST=0.0.0.0
API_CORS_ORIGIN=https://yourdomain.com

# Dashboard
DASHBOARD_PORT=5173
```

## Nginx Reverse Proxy

```nginx
# /etc/nginx/sites-available/prompt-harvester

server {
    listen 80;
    server_name prompt-harvester.yourdomain.com;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name prompt-harvester.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # Dashboard
    location / {
        proxy_pass http://localhost:5173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # API
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## SSL Certificate (Let's Encrypt)

```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d prompt-harvester.yourdomain.com
sudo certbot renew --dry-run
```

## Monitoring

### Health Checks

```bash
# API health
curl http://localhost:3000/health

# Qdrant health
curl http://localhost:6333/health

# PostgreSQL
psql -U postgres -d prompt_harvester -c "SELECT 1"
```

### Logs

```bash
# API logs
pm2 logs prompt-harvester-api

# Dashboard logs
pm2 logs prompt-harvester-dashboard

# PostgreSQL logs
tail -f /var/log/postgresql/postgresql-15-main.log

# Nginx logs
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

### Performance Monitoring

```bash
# Install monitoring tools
npm install -g pm2-logrotate
pm2 install pm2-metrics

# View metrics
pm2 monit
```

## Backup Strategy

### Automated Backups

Already configured via cron (see setup-cron.sh):
- Daily backups at 1 AM
- Weekly backups at 5 AM Sunday
- Retention: 7 daily, 4 weekly, 12 monthly

### Manual Backup

```bash
# Database backup
pg_dump -U postgres prompt_harvester > backup-$(date +%Y%m%d).sql

# Full system backup
bun run src/scripts/backup-automated.ts daily

# Backup to S3/R2
aws s3 sync ./backups s3://your-backup-bucket/prompt-harvester/
```

### Restore from Backup

```bash
# Restore database
psql -U postgres prompt_harvester < backup-20250118.sql

# Restore from archive
unzip backup-daily-2025-01-18.zip
psql -U postgres prompt_harvester < conversations.json
```

## Security Checklist

- [ ] Change default PostgreSQL password
- [ ] Enable SSL/TLS for all connections
- [ ] Set up firewall rules (UFW or iptables)
- [ ] Enable Qdrant authentication
- [ ] Use environment variables for secrets (never commit)
- [ ] Set up regular security updates
- [ ] Enable rate limiting on API
- [ ] Configure CORS properly
- [ ] Use HTTPS only in production
- [ ] Enable database connection pooling
- [ ] Set up log rotation
- [ ] Monitor for failed login attempts
- [ ] Regular backup testing

## Troubleshooting

### API won't start
```bash
# Check port availability
netstat -tulpn | grep :3000

# Check environment variables
printenv | grep DATABASE_URL

# Check logs
pm2 logs prompt-harvester-api --lines 100
```

### Dashboard connection errors
```bash
# Verify API is running
curl http://localhost:3000/health

# Check proxy configuration
cat dashboard/vite.config.ts

# Clear browser cache and rebuild
cd dashboard && rm -rf node_modules .svelte-kit && npm install && npm run build
```

### Database connection issues
```bash
# Test connection
psql $DATABASE_URL -c "SELECT NOW()"

# Check PostgreSQL status
sudo systemctl status postgresql

# View connection limits
psql -U postgres -c "SHOW max_connections"
```

## Performance Tuning

### PostgreSQL

```sql
-- Increase connection pool
ALTER SYSTEM SET max_connections = 200;

-- Optimize for SSDs
ALTER SYSTEM SET random_page_cost = 1.1;

-- Increase shared buffers (25% of RAM)
ALTER SYSTEM SET shared_buffers = '4GB';

-- Reload configuration
SELECT pg_reload_conf();
```

### Qdrant

```yaml
# config/production.yaml
service:
  max_request_size_mb: 64
  max_workers: 4

storage:
  performance:
    max_search_threads: 4
```

## Scaling

### Horizontal Scaling

- Deploy multiple API instances behind a load balancer
- Use read replicas for PostgreSQL
- Consider Qdrant clustering for large deployments
- Use Redis for session management

### Vertical Scaling

- Increase PostgreSQL resources (RAM, CPU)
- Upgrade Qdrant instance size
- Add more worker processes to API server

---

For questions or issues, see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) or file an issue on GitHub.
