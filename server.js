const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 10000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Данные сезона
const SEASON_END_DATE = new Date('2026-03-31T23:59:59');

// API маршруты
app.get('/api/season-countdown', (req, res) => {
    const now = new Date();
    const timeLeft = SEASON_END_DATE - now;
    
    if (timeLeft <= 0) {
        return res.json({ ended: true, message: 'Сезон завершен!' });
    }

    const years = Math.floor(timeLeft / (1000 * 60 * 60 * 24 * 365));
    const months = Math.floor((timeLeft % (1000 * 60 * 60 * 24 * 365)) / (1000 * 60 * 60 * 24 * 30));
    const weeks = Math.floor((timeLeft % (1000 * 60 * 60 * 24 * 30)) / (1000 * 60 * 60 * 24 * 7));
    const days = Math.floor((timeLeft % (1000 * 60 * 60 * 24 * 7)) / (1000 * 60 * 60 * 24));
    const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);

    res.json({
        ended: false,
        timeLeft: timeLeft,
        years: years,
        months: months,
        weeks: weeks,
        days: days,
        hours: hours,
        minutes: minutes,
        seconds: seconds,
        endDate: SEASON_END_DATE.toISOString()
    });
});

// Анкета на сервер
app.post('/api/server-application', (req, res) => {
    const application = req.body;
    application.id = 'app_' + Date.now();
    application.status = 'pending';
    application.createdAt = new Date().toISOString();
    
    // Сохраняем анкету
    saveApplication(application);
    res.json({ success: true, applicationId: application.id });
});

// Анкета в студию
app.post('/api/studio-application', (req, res) => {
    const application = req.body;
    application.id = 'studio_app_' + Date.now();
    application.type = 'studio';
    application.status = 'pending';
    application.createdAt = new Date().toISOString();
    
    saveApplication(application);
    res.json({ success: true, applicationId: application.id });
});

// Получение статуса анкет пользователя
app.get('/api/user-applications/:userId', (req, res) => {
    const userId = req.params.userId;
    const applications = getApplications().filter(app => app.userId === userId);
    res.json({ applications });
});

// Роуты для страниц
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/profile', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'profile.html'));
});

app.get('/wiki', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'wiki.html'));
});

app.get('/faq', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'faq.html'));
});

app.get('/team', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'team.html'));
});

// Вспомогательные функции
function saveApplication(application) {
    const applications = getApplications();
    applications.push(application);
    try {
        if (!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive: true });
        fs.writeFileSync('./data/applications.json', JSON.stringify(applications, null, 2));
    } catch (error) {
        console.error('Error saving application:', error);
    }
}

function getApplications() {
    try {
        if (fs.existsSync('./data/applications.json')) {
            return JSON.parse(fs.readFileSync('./data/applications.json', 'utf8'));
        }
    } catch (error) {
        console.error('Error reading applications:', error);
    }
    return [];
}

app.listen(port, () => {
    console.log(`🚀 Сервер Jessie Minecraft SMP запущен на порту ${port}`);
    console.log(`📍 URL: https://jessie-minecraft-smp.onrender.com`);
    console.log(`⏰ Сезон завершится: ${SEASON_END_DATE.toLocaleString('ru-RU')}`);
});
