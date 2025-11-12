# Deployment Guide - Jain SMS API

Complete guide to deploy the SMS API on your VM with static IP.

## Prerequisites

- Ubuntu/Debian-based Linux server with static public IP
- Node.js 18+ installed
- PM2 installed globally
- IP whitelisted with Pragati Infocom

## Step-by-Step Deployment

### 1. Prepare the VM

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js (if not installed)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Create app directory
sudo mkdir -p /opt/jain-sms-api
sudo chown $USER:$USER /opt/jain-sms-api
```

### 2. Transfer Files to VM

```bash
# From your local machine
scp -r sms-api/* user@your-vm-ip:/opt/jain-sms-api/

# OR using rsync
rsync -azP --delete --exclude ".git" --exclude "node_modules" -e "ssh -i ~/.ssh/gcp_jery" --exclude "logs" \
  ./sms-api/ jery99961@35.208.228.96:~/all-projects/sms-api/
```

### 3. Install Dependencies

```bash
# SSH into VM
ssh user@your-vm-ip

# Navigate to app directory
cd /opt/jain-sms-api

# Install dependencies
npm install --production
```

### 4. Configure Environment

```bash
# Create .env file
cp .env.example .env

# Edit with your credentials
nano .env
```

Update these critical values:
```env
API_SECRET_KEY=generate-a-strong-random-key-here
PRAGATI_API_KEY=your_actual_api_key_from_pragati
DLT_ENTITY_ID=your_actual_entity_id
ALLOWED_ORIGINS=https://jain-attendance-portal.vercel.app
```

### 5. Create Logs Directory

```bash
mkdir -p logs
```

### 6. Test the API

```bash
# Start in development mode
npm run dev

# In another terminal, test
curl http://localhost:3001/health
```

### 7. Start with PM2

```bash
# Start the service
pm2 start ecosystem.config.js

# Check status
pm2 status

# View logs
pm2 logs jain-sms-api

# Save PM2 process list
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Follow the command it gives you (usually starts with sudo)
```

### 8. Setup Caddy Reverse Proxy (Recommended)

**Why Caddy:** Automatic HTTPS, clean URLs, better security

```bash
# Install Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy -y

# Create Caddyfile
sudo tee /etc/caddy/Caddyfile > /dev/null <<'EOF'
sms-api.your-domain.com {
    reverse_proxy localhost:3101
    
    encode gzip
    
    log {
        output file /var/log/caddy/sms-api.log
    }
}
EOF

# Test and reload
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl enable caddy
sudo systemctl restart caddy
```

**Configure Firewall:**
```bash
# Open ports 80 and 443 (for Caddy HTTPS)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw status
```

**DNS Setup:**
- Add A record: `sms-api` → `your-vm-ip`
- Wait for DNS propagation
- Access via: `https://sms-api.your-domain.com/health`

### 9. Alternative: Direct Port Access (Without Reverse Proxy)

**If you prefer Nginx over Caddy:**

```bash
# Install Nginx
sudo apt install nginx -y

# Allow port 3101 (if not using reverse proxy)
sudo ufw allow 3101/tcp

# Create config
sudo nano /etc/nginx/sites-available/sms-api
```

Add this configuration:
```nginx
server {
    listen 80;
    server_name your-vm-ip-or-domain;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/sms-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 10. Setup SSL (if using domain)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Get SSL certificate
sudo certbot --nginx -d your-domain.com
```

### 11. Monitor and Maintain

```bash
# Check PM2 status
pm2 status

# View logs
pm2 logs jain-sms-api --lines 100

# Monitor resources
pm2 monit

# Restart if needed
pm2 restart jain-sms-api

# View PM2 dashboard (optional)
pm2 web
```

## Updating the Application

```bash
# SSH into VM
ssh user@your-vm-ip

# Navigate to app directory
cd /opt/jain-sms-api

# Pull latest code (if using git)
git pull

# Or transfer updated files
# (from local machine)
scp -r sms-api/* user@your-vm-ip:/opt/jain-sms-api/

# Install any new dependencies
npm install --production

# Restart PM2
pm2 restart jain-sms-api

# Check logs
pm2 logs jain-sms-api
```

## Backup Strategy

```bash
# Create backup script
sudo nano /opt/backup-sms-api.sh
```

```bash
#!/bin/bash
BACKUP_DIR="/opt/backups/sms-api"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR
tar -czf $BACKUP_DIR/sms-api-$DATE.tar.gz \
  /opt/jain-sms-api/.env \
  /opt/jain-sms-api/logs

# Keep only last 7 backups
find $BACKUP_DIR -name "sms-api-*.tar.gz" -mtime +7 -delete
```

```bash
# Make executable
sudo chmod +x /opt/backup-sms-api.sh

# Add to cron (daily at 2 AM)
crontab -e
# Add: 0 2 * * * /opt/backup-sms-api.sh
```

## Troubleshooting

### API Not Responding
```bash
# Check if PM2 is running
pm2 status

# Check logs
pm2 logs jain-sms-api --err

# Restart
pm2 restart jain-sms-api
```

### Firewall Issues (Port Not Accessible)

**Symptom:** API works locally but times out from internet

```bash
# Check if app is listening on all interfaces
sudo netstat -tulpn | grep 3101
# Should show: 0.0.0.0:3101 (not 127.0.0.1:3101)

# Check UFW status
sudo ufw status numbered

# Open port if using direct access
sudo ufw allow 3101/tcp

# Or open 80/443 if using Caddy
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# For GCP, check Cloud Firewall rules
gcloud compute firewall-rules list
```

### Port Already in Use
```bash
# Find process using port 3001
sudo lsof -i :3001

# Kill if needed
sudo kill -9 <PID>
```

### Memory Issues
```bash
# Check memory usage
pm2 monit

# Increase max memory in ecosystem.config.js
# max_memory_restart: '1G'
```

## Security Checklist

- [ ] Strong API_SECRET_KEY set in .env
- [ ] Firewall configured (only allow necessary ports)
- [ ] SSH key-based authentication enabled
- [ ] Regular system updates scheduled
- [ ] Logs rotated to prevent disk fill
- [ ] Backup strategy implemented
- [ ] HTTPS enabled (if using domain)
- [ ] CORS origins restricted
- [ ] Rate limiting configured

## Testing from Your Next.js App

Update your cron route to call this API:

```javascript
// In your Next.js app/api/cron/route.ts
const response = await fetch('http://your-vm-ip:3001/api/sms/send', {
  method: 'POST',
  headers: {
    'X-API-Key': process.env.SMS_API_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    recipients: [
      { phone: '9876543210', message: 'Test message' }
    ]
  })
});
```

## Complete! 🎉

Your SMS API is now deployed and running on your VM with static IP!
