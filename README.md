# memaide-caregiver
Recommended Repo Structure:

memaide-caregiver/
  backend/
  caregiver-portal/
  mobile-android/
  watch-wearos/
  docs/
  deployment/
  README.md


Branch strategy

Use:
main        stable/demo branch
dev         integration branch
feature/*  student work branches


Rules:

* Students push to feature/student-name-feature
* Pull request into dev
* You test dev
* Merge dev into main for stable demo


Exammple Commands:
git checkout -b feature/reminders
git add .
git commit -m "Add reminder CRUD"
git push origin feature/reminders



3) Server deployment workflow

A. Clone repo on server

Login as your deployment user:

ssh fariborz@YOUR_SERVER_IP
mkdir -p ~/apps
cd ~/apps
git clone git@github.com:GuardiaNova/memaide-caregiver.git
cd memaide-caregiver

If using HTTPS:

git clone https://github.com/GuardiaNova/memaide-caregiver.git

SSH deploy key is better later.

⸻

B. Backend runtime recommendation

For student project:

* Backend: Node.js/Express or FastAPI
* Database: PostgreSQL
* Frontend: React
* Reverse proxy: Nginx
* Process manager: PM2 for Node or systemd for Python

Install Node:

curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v

Install PostgreSQL:

sudo apt install -y postgresql postgresql-contrib

⸻

4) Real-time integration/testing workflow

Recommended flow:

Student pushes branch
→ Pull Request
→ merge to dev
→ server pulls dev
→ restart backend/frontend
→ everyone tests same live server

Manual deploy command on server:

cd ~/apps/memaide-caregiver
git checkout dev
git pull origin dev

Then, for backend:

cd backend
npm install
npm run build
pm2 restart memaide-backend

For React portal:

cd caregiver-portal
npm install
npm run build
sudo cp -r dist/* /var/www/memaide/

⸻

5) Recommended GitHub Actions later

Once basic manual deploy works, add CI/CD:

push to dev
→ run tests
→ SSH into DigitalOcean
→ git pull
→ rebuild
→ restart services


