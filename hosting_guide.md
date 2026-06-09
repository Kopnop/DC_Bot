# Hosting Guide: Node.js & React on Raspberry Pi 3 Model B (with Cloudflare Tunnels)

This guide walks you through setting up your Raspberry Pi 3 Model B from scratch to host a full-stack Node.js and React website securely using your domain **kopnop.com** via Cloudflare Tunnels (no port forwarding required).

---

## Step 1: Initial Raspberry Pi Setup
1. Insert your MicroSD card into your Windows PC.
2. Download and open the **[Raspberry Pi Imager](https://www.raspberrypi.com/software/)**.
3. Choose your settings:
   - **Device:** Raspberry Pi 3
   - **OS:** Raspberry Pi OS Lite (64-bit) (or 32-bit)
   - **Storage:** Select your MicroSD card.
4. Click **Next**, then select **EDIT SETTINGS** to apply optimizations:
   - **General Tab:** Configure your Wi-Fi credentials, set a custom username and password, and set your timezone.
   - **Services Tab:** Check **Enable SSH** and select **Use password authentication**.
5. Click **Save** and write the image to the card.
6. Insert the MicroSD card into your Raspberry Pi and plug in the power supply.
7. Wait 1-2 minutes for it to boot. Open **PowerShell** on your Windows PC and connect to your Pi:
   ```powershell
   ssh your_username@raspberrypi.local
   ```
   *(Enter your password when prompted).*

---

## Step 2: Install Node.js, Nginx, and PM2
Run the following commands inside the Raspberry Pi terminal to install all required software:

1. **Update system packages:**
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```
2. **Install Node.js (Version 18):**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt install -y nodejs
   ```
3. **Install Nginx (Web Server) and Git:**
   ```bash
   sudo apt install -y nginx git
   ```
4. **Install PM2 globally (Process Manager):**
   ```bash
   sudo npm install -g pm2
   ```

---

## Step 3: Deploy your React + Node.js Code
1. **Create the website directory:**
   ```bash
   sudo mkdir -p /var/www/kopnop
   sudo chown -R $USER:$USER /var/www/kopnop
   ```
2. **Transfer your files:** Clone your GitHub repository or use SFTP (e.g., via FileZilla) to upload your files to `/var/www/kopnop`.
3. **Build your React frontend:**
   - On your local PC (recommended to save memory on the Pi), run:
     ```bash
     npm run build
     ```
   - Transfer the resulting build folder (usually `dist` or `build`) to the Pi at `/var/www/kopnop/frontend/dist`.
4. **Start your Node.js backend with PM2:**
   ```bash
   cd /var/www/kopnop/backend
   npm install --production
   pm2 start server.js --name "kopnop-backend"
   pm2 save
   pm2 startup
   ```
   *(Copy and run the command PM2 prints to enable auto-start on system boot).*

---

## Step 4: Configure Nginx as a Reverse Proxy
Nginx will listen on port 80 to serve the React frontend files and forward `/api` requests to your Node.js server.

1. **Create the Nginx configuration file:**
   ```bash
   sudo nano /etc/nginx/sites-available/kopnop.com
   ```
2. **Paste the following configuration:**
   ```nginx
   server {
       listen 80;
       server_name kopnop.com www.kopnop.com;

       # Serve React Static Files
       location / {
           root /var/www/kopnop/frontend/dist;
           index index.html;
           try_files $uri $uri/ /index.html;
       }

       # Forward API requests to Node.js backend (running on port 5000)
       location /api/ {
           proxy_pass http://localhost:5000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```
   *(Save and exit by pressing `Ctrl + O`, `Enter`, and then `Ctrl + X`).*
3. **Enable the site configuration:**
   ```bash
   sudo ln -s /etc/nginx/sites-available/kopnop.com /etc/nginx/sites-enabled/
   sudo rm /etc/nginx/sites-enabled/default  # Disable default site
   sudo systemctl restart nginx
   ```

---

## Step 5: Link kopnop.com via Cloudflare Tunnel
Instead of exposing your home router or public IP, route your domain securely through Cloudflare.

### Phase A: Connect Domain to Cloudflare
1. Sign up for a free account at **[Cloudflare](https://www.cloudflare.com)**.
2. Click **Add a Site** and enter `kopnop.com`.
3. Choose the **Free Plan**.
4. Cloudflare will generate two nameservers (e.g. `anna.ns.cloudflare.com`).
5. Log into the registrar where you purchased `kopnop.com` and replace your current nameservers with Cloudflare's.

### Phase B: Create the Tunnel on Cloudflare
1. Go to the Cloudflare Dashboard, and click on **Zero Trust** on the left panel.
2. Navigate to **Networks** -> **Tunnels** and click **Create a Tunnel**.
3. Choose **Cloudflare Tunnel (connector)**, name it `pi-tunnel`, and click save.
4. Select **Debian** and **armhf** (or arm64 depending on your Pi OS architecture) on the installation page.
5. Copy the command listed under **Install and run a connector** and run it in the Raspberry Pi terminal. It looks like:
   ```bash
   curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/... && sudo dpkg -i cloudflared.deb && sudo cloudflared service install <your_token>
   ```

### Phase C: Route Domain to Nginx
1. In Cloudflare, click **Next** after the connector successfully registers.
2. Under **Public Hostname**:
   - **Domain:** Select `kopnop.com`
   - **Subdomain:** Leave blank (or set up `www` if desired).
   - **Service Type:** Choose **HTTP**.
   - **URL:** Type `localhost:80` (this directs traffic to your Nginx web server).
3. Click **Save Tunnel**.

Your website will now be live at `https://kopnop.com` with full SSL encryption!
