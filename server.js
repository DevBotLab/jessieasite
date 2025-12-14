const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 10000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Данные сезона (обновленные)
const SEASON_END_DATE = new Date(Date.now() + 
    (365 * 24 * 60 * 60 * 1000) + // 1 год
    (3 * 30 * 24 * 60 * 60 * 1000) + // 3 месяца
    (4 * 7 * 24 * 60 * 60 * 1000) + // 4 недели
    (2 * 24 * 60 * 60 * 1000) + // 2 дня
    (17 * 60 * 60 * 1000) + // 17 часов
    (52 * 60 * 1000) // 52 минуты
);

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

// Уведомления
app.get('/api/notifications/:userId', (req, res) => {
    const userId = req.params.userId;
    const notifications = getNotifications().filter(n => n.userId === userId || !n.userId);
    res.json({ notifications });
});

app.post('/api/notifications/mark-read', (req, res) => {
    const { notificationId, userId } = req.body;
    const notifications = getNotifications();
    const notification = notifications.find(n => n.id === notificationId);
    
    if (notification) {
        notification.read = true;
        notification.readAt = new Date().toISOString();
        saveNotifications(notifications);
    }
    
    res.json({ success: true });
});

// Анкеты
app.post('/api/application', (req, res) => {
    const application = req.body;
    application.id = 'app_' + Date.now();
    application.status = 'pending';
    application.createdAt = new Date().toISOString();
    
    saveApplication(application);
    
    // Создаем уведомление о подаче анкеты
    addNotification({
        userId: application.userId,
        title: 'Анкета подана',
        message: 'Ваша анкета отправлена на рассмотрение',
        type: 'info',
        createdAt: new Date().toISOString()
    });
    
    res.json({ success: true, applicationId: application.id });
});

app.get('/api/user-ip/:userId', (req, res) => {
    const userId = req.params.userId;
    const applications = getApplications();
    const userApp = applications.find(app => app.userId === userId && app.status === 'approved');
    
    res.json({ 
        hasAccess: !!userApp,
        ip: userApp ? 'play.jessiesmp.online:25565' : null
    });
});

// Основные страницы
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

function saveApplication(application) {
    const applications = getApplications();
    applications.push(application);
    saveApplications(applications);
}

function saveApplications(applications) {
    try {
        if (!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive: true });
        fs.writeFileSync('./data/applications.json', JSON.stringify(applications, null, 2));
    } catch (error) {
        console.error('Error saving applications:', error);
    }
}

function getNotifications() {
    try {
        if (fs.existsSync('./data/notifications.json')) {
            return JSON.parse(fs.readFileSync('./data/notifications.json', 'utf8'));
        }
    } catch (error) {
        console.error('Error reading notifications:', error);
    }
    return [];
}

function saveNotifications(notifications) {
    try {
        if (!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive: true });
        fs.writeFileSync('./data/notifications.json', JSON.stringify(notifications, null, 2));
    } catch (error) {
        console.error('Error saving notifications:', error);
    }
}

function addNotification(notification) {
    const notifications = getNotifications();
    notification.id = 'notif_' + Date.now();
    notifications.push(notification);
    saveNotifications(notifications);
}

// Создаем начальные данные
function initializeData() {
    if (!fs.existsSync('./data/notifications.json')) {
        const initialNotifications = [
            {
                id: 'notif_1',
                title: 'Добро пожаловать!',
                message: 'Сервер Jessie SMP запущен. Присоединяйтесь к нашему сообществу!',
                type: 'welcome',
                createdAt: new Date().toISOString(),
                read: false
            },
            {
                id: 'notif_2', 
                title: 'Новый сезон',
                message: 'Текущий сезон продлится до начала 2027 года',
                type: 'info',
                createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
                read: false
            },
            {
                id: 'notif_3',
                title: 'Обновление системы',
                message: 'Добавлена новая система анкет и уведомлений',
                type: 'update',
                createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
                read: false
            }
        ];
        saveNotifications(initialNotifications);
    }
}

initializeData();

app.listen(port, () => {
    console.log(`🚀 Сервер Jessie Minecraft SMP запущен на порту ${port}`);
    console.log(`📍 URL: https://jessie-minecraft-smp.onrender.com`);
    console.log(`⏰ Сезон завершится: ${SEASON_END_DATE.toLocaleString('ru-RU')}`);
});
