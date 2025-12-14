const express = require('express');
const path = require('path');
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const port = process.env.PORT || 3000;

// Конфигурация Telegram бота
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8316043065:AAEwu5tU3Kc2iAgvNfgScKIf-68tB5I5vI4';
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || '7945088917';

// Инициализация бота только если токен указан
let bot = null;
if (BOT_TOKEN && BOT_TOKEN !== 'YOUR_BOT_TOKEN_HERE') {
    try {
        bot = new TelegramBot(BOT_TOKEN, { polling: true });
        console.log('✅ Telegram бот запущен');
        
        // Обработчик сообщений
        bot.on('message', (msg) => {
            const chatId = msg.chat.id;
            console.log(`Получено сообщение от ${chatId}: ${msg.text}`);
        });

        // Обработчик callback запросов для анкет
        bot.on('callback_query', (callbackQuery) => {
            const message = callbackQuery.message;
            const data = callbackQuery.data;
            const [action, applicationId] = data.split('_');
            
            console.log(`Callback: ${action} для анкеты ${applicationId}`);
            
            // Здесь будет логика обработки анкет
            bot.answerCallbackQuery(callbackQuery.id, {
                text: `Анкета ${action === 'approve' ? 'одобрена' : 'отклонена'}`
            });
        });

    } catch (error) {
        console.error('❌ Ошибка инициализации Telegram бота:', error);
    }
} else {
    console.log('⚠️ Telegram бот не настроен. Укажите BOT_TOKEN в переменных окружения');
}

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Данные сезона (дата окончания)
const SEASON_END_DATE = new Date('2026-03-31T23:59:59'); // 31 марта 2026 года

// Маршрут для получения времени до конца сезона
app.get('/api/season-countdown', (req, res) => {
    const now = new Date();
    const timeLeft = SEASON_END_DATE - now;
    
    if (timeLeft <= 0) {
        return res.json({
            ended: true,
            message: 'Сезон завершен!'
        });
    }

    // Расчет времени
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

// API для анкет
app.post('/api/application/submit', (req, res) => {
    const application = req.body;
    
    // Сохраняем анкету
    const applications = getApplications();
    application.id = 'app_' + Date.now();
    application.status = 'pending';
    application.createdAt = new Date().toISOString();
    applications.push(application);
    saveApplications(applications);

    // Отправляем в Telegram если бот активен
    if (bot && ADMIN_CHAT_ID) {
        try {
            const message = `
🎮 *Новая анкета на Jessie Minecraft SMP*

*Никнейм:* ${application.nickname}
*Возраст:* ${application.age}
*Опыт:* ${application.experience}
*Стиль игры:* ${application.playstyle}
*Telegram:* ${application.telegram || 'Не указан'}

*О себе:*
${application.about}

*ID анкеты:* ${application.id}
            `.trim();

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '✅ Принять', callback_data: `approve_${application.id}` },
                        { text: '❌ Отклонить', callback_data: `reject_${application.id}` }
                    ]
                ]
            };

            bot.sendMessage(ADMIN_CHAT_ID, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });

        } catch (error) {
            console.error('Ошибка отправки в Telegram:', error);
        }
    }

    res.json({ success: true, applicationId: application.id });
});

// Проверка статуса анкеты
app.post('/api/application/status', (req, res) => {
    const { userId } = req.body;
    const applications = getApplications();
    const userApplication = applications.find(app => app.userId === userId);
    
    res.json({
        exists: !!userApplication,
        application: userApplication || null
    });
});

// Обновление статуса анкеты (для админов)
app.post('/api/application/update', (req, res) => {
    const { applicationId, status, adminUsername } = req.body;
    const applications = getApplications();
    const application = applications.find(app => app.id === applicationId);
    
    if (application) {
        application.status = status;
        application.reviewedBy = adminUsername;
        application.reviewedAt = new Date().toISOString();
        saveApplications(applications);
        
        res.json({ success: true });
    } else {
        res.json({ success: false, error: 'Анкета не найдена' });
    }
});

// Вспомогательные функции для работы с данными
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

function saveApplications(applications) {
    try {
        if (!fs.existsSync('./data')) {
            fs.mkdirSync('./data', { recursive: true });
        }
        fs.writeFileSync('./data/applications.json', JSON.stringify(applications, null, 2));
    } catch (error) {
        console.error('Error saving applications:', error);
    }
}

function getPhotos() {
    try {
        if (fs.existsSync('./data/photos.json')) {
            return JSON.parse(fs.readFileSync('./data/photos.json', 'utf8'));
        }
    } catch (error) {
        console.error('Error reading photos:', error);
    }
    return [];
}

function savePhotos(photos) {
    try {
        if (!fs.existsSync('./data')) {
            fs.mkdirSync('./data', { recursive: true });
        }
        fs.writeFileSync('./data/photos.json', JSON.stringify(photos, null, 2));
    } catch (error) {
        console.error('Error saving photos:', error);
    }
}

// Основной маршрут
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
    console.log(`🚀 Сервер Jessie Minecraft SMP запущен на порту ${port}`);
    console.log(`📍 URL: http://localhost:${port}`);
    
    if (bot) {
        console.log('✅ Telegram бот активен');
    } else {
        console.log('⚠️ Telegram бот не активирован. Проверьте переменные окружения:');
        console.log('   - TELEGRAM_BOT_TOKEN');
        console.log('   - ADMIN_CHAT_ID');
    }
    
    console.log(`⏰ Сезон завершится: ${SEASON_END_DATE.toLocaleString('ru-RU')}`);
});
