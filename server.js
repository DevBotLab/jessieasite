const express = require('express');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

// Конфигурация
const CONFIG = {
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || 'YOUR_BOT_TOKEN',
    ADMIN_CHAT_ID: process.env.ADMIN_CHAT_ID || 'YOUR_CHAT_ID',
    MAIN_ADMIN: process.env.MAIN_ADMIN || '@mainadmin'
};

// Инициализация Telegram бота
let bot;
if (CONFIG.TELEGRAM_BOT_TOKEN !== 'YOUR_BOT_TOKEN') {
    bot = new TelegramBot(CONFIG.TELEGRAM_BOT_TOKEN, { polling: true });
}

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Хранение данных (в реальном приложении используйте базу данных)
const applicationsFile = './data/applications.json';
const usersFile = './data/users.json';

// Создание папки данных если не существует
if (!fs.existsSync('./data')) {
    fs.mkdirSync('./data');
}

// Функции для работы с файлами
function readApplications() {
    try {
        if (fs.existsSync(applicationsFile)) {
            return JSON.parse(fs.readFileSync(applicationsFile, 'utf8'));
        }
    } catch (error) {
        console.error('Error reading applications:', error);
    }
    return [];
}

function writeApplications(applications) {
    try {
        fs.writeFileSync(applicationsFile, JSON.stringify(applications, null, 2));
        return true;
    } catch (error) {
        console.error('Error writing applications:', error);
        return false;
    }
}

function readUsers() {
    try {
        if (fs.existsSync(usersFile)) {
            return JSON.parse(fs.readFileSync(usersFile, 'utf8'));
        }
    } catch (error) {
        console.error('Error reading users:', error);
    }
    return {};
}

function writeUsers(users) {
    try {
        fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
        return true;
    } catch (error) {
        console.error('Error writing users:', error);
        return false;
    }
}

// API маршруты

// Получение статуса анкеты
app.post('/api/application/status', (req, res) => {
    const { userId } = req.body;
    const applications = readApplications();
    
    const userApplication = applications.find(app => app.userId === userId && !app.deleted);
    
    if (userApplication) {
        res.json({
            status: true,
            application: userApplication
        });
    } else {
        res.json({
            status: false
        });
    }
});

// Отправка анкеты
app.post('/api/application/submit', (req, res) => {
    const applicationData = req.body;
    
    // Проверяем есть ли уже анкета
    const applications = readApplications();
    const existingApplication = applications.find(app => 
        app.userId === applicationData.userId && !app.deleted
    );
    
    if (existingApplication) {
        return res.json({
            success: false,
            error: 'У вас уже есть активная анкета'
        });
    }
    
    // Создаем новую анкету
    const newApplication = {
        ...applicationData,
        id: 'app_' + Date.now(),
        status: 'pending',
        createdAt: new Date().toISOString()
    };
    
    applications.push(newApplication);
    
    if (writeApplications(applications)) {
        // Отправляем уведомление в Telegram
        sendApplicationToTelegram(newApplication);
        
        res.json({
            success: true,
            applicationId: newApplication.id
        });
    } else {
        res.json({
            success: false,
            error: 'Ошибка сохранения анкеты'
        });
    }
});

// Функция отправки анкеты в Telegram
function sendApplicationToTelegram(application) {
    if (!bot) return;
    
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
*Время подачи:* ${new Date(application.createdAt).toLocaleString('ru-RU')}
    `.trim();
    
    const keyboard = {
        inline_keyboard: [
            [
                { text: '✅ Принять', callback_data: `approve_${application.id}` },
                { text: '❌ Отклонить', callback_data: `reject_${application.id}` }
            ]
        ]
    };
    
    bot.sendMessage(CONFIG.ADMIN_CHAT_ID, message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
    }).catch(error => {
        console.error('Error sending message to Telegram:', error);
    });
}

// Обработка callback от Telegram бота
if (bot) {
    bot.on('callback_query', async (callbackQuery) => {
        const { data, message, from } = callbackQuery;
        const chatId = message.chat.id;
        
        // Проверяем права пользователя
        const users = readUsers();
        const userRoles = users[from.username] || [];
        
        const isMainAdmin = from.username === CONFIG.MAIN_ADMIN.replace('@', '');
        const isAdmin = userRoles.includes('admin') || isMainAdmin;
        const isOwner = userRoles.includes('owner') || isMainAdmin;
        const isCurator = userRoles.includes('curator') || isAdmin || isOwner;
        
        if (!isCurator) {
            bot.answerCallbackQuery(callbackQuery.id, {
                text: 'У вас нет прав для этого действия'
            });
            return;
        }
        
        const [action, applicationId] = data.split('_');
        const applications = readApplications();
        const application = applications.find(app => app.id === applicationId);
        
        if (!application) {
            bot.answerCallbackQuery(callbackQuery.id, {
                text: 'Анкета не найдена'
            });
            return;
        }
        
        if (action === 'approve' || action === 'reject') {
            application.status = action === 'approve' ? 'approved' : 'rejected';
            application.reviewedBy = from.username;
            application.reviewedAt = new Date().toISOString();
            
            if (writeApplications(applications)) {
                let newKeyboard;
                
                if (isMainAdmin || isOwner) {
                    newKeyboard = {
                        inline_keyboard: [
                            [
                                { text: '🎮 Администратор', callback_data: `role_admin_${application.id}` },
                                { text: '👑 Владелец', callback_data: `role_owner_${application.id}` },
                                { text: '📋 Куратор', callback_data: `role_curator_${application.id}` }
                            ],
                            [
                                { text: '✅ Принято', callback_data: 'already_approved' },
                                { text: '❌ Отклонено', callback_data: 'already_rejected' }
                            ]
                        ]
                    };
                } else {
                    newKeyboard = {
                        inline_keyboard: [
                            [
                                { text: action === 'approve' ? '✅ Принято' : '❌ Отклонено', 
                                  callback_data: action === 'approve' ? 'already_approved' : 'already_rejected' }
                            ]
                        ]
                    };
                }
                
                // Обновляем сообщение
                bot.editMessageReplyMarkup(newKeyboard, {
                    chat_id: chatId,
                    message_id: message.message_id
                });
                
                bot.answerCallbackQuery(callbackQuery.id, {
                    text: `Анкета ${action === 'approve' ? 'принята' : 'отклонена'}`
                });
            }
        } else if (action === 'role') {
            const role = applicationId.split('_')[1];
            const appId = applicationId.split('_')[2];
            
            const roleApplication = applications.find(app => app.id === appId);
            if (!roleApplication) return;
            
            // Запрос на указание пользователя
            bot.answerCallbackQuery(callbackQuery.id, {
                text: `Введите @username пользователя для выдачи роли ${role}`
            });
            
            // Здесь нужно реализовать логику запроса username
            // Это упрощенная версия - в реальном приложении нужно использовать состояние бота
        }
    });
}

// Выдача ролей (упрощенная версия)
app.post('/api/admin/give-role', (req, res) => {
    const { username, role, adminUsername } = req.body;
    
    // Проверка прав
    const users = readUsers();
    const adminRoles = users[adminUsername] || [];
    
    const isMainAdmin = adminUsername === CONFIG.MAIN_ADMIN.replace('@', '');
    const canGiveRole = isMainAdmin || 
                       (role === 'curator' && adminRoles.includes('admin')) ||
                       (adminRoles.includes('owner'));
    
    if (!canGiveRole) {
        return res.json({ success: false, error: 'Недостаточно прав' });
    }
    
    if (!users[username]) {
        users[username] = [];
    }
    
    if (!users[username].includes(role)) {
        users[username].push(role);
    }
    
    if (writeUsers(users)) {
        res.json({ success: true });
    } else {
        res.json({ success: false, error: 'Ошибка сохранения' });
    }
});

// Основной маршрут
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Все остальные маршруты перенаправляем на index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
    console.log(`🚀 Сервер Jessie Minecraft SMP запущен на порту ${port}`);
    console.log(`📍 URL: http://localhost:${port}`);
    if (!bot) {
        console.log('⚠️  Telegram бот не настроен. Проверьте переменные окружения.');
    }
});
