# 公交运行信息提示系统 (Bus System)

基于 RFID 的公交车运行信息提示系统。包含硬件刷卡采集、Node.js 后端、Vue 网页管理端、Android 乘客端。

## 系统架构
- **硬件**：ESP32 + MFRC522 RFID 模块
- **后端**：Node.js + Express + MySQL
- **网页端**：Vue 3 + Vite
- **手机端**：Android (Java + XML)

## 运行说明
### 1. 数据库
- 导入建表语句
- 修改 `server.js` 中的 MySQL 密码

### 2. 启动后端

npm install
node server.js

### 3. 启动网页端
bash
cd frontend
npm install
npm run dev

### 4. 硬件端
使用 Arduino IDE 打开硬件代码，修改 WiFi 和服务器 IP 后烧录至 ESP32。


3. 保存文件。
4. 在终端里依次执行：
  
   git add README.md
   git commit -m "docs: 添加 README 说明文档"
   git push