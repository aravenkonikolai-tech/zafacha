"use strict";

// ==================== ФОЛБЭК ДЛЯ УВЕДОМЛЕНИЙ ====================
if (typeof showNotification !== 'function') {
    function showNotification(message, type = 'info') {
        console.warn(`[FALLBACK NOTIFICATION] ${type.toUpperCase()}: ${message}`);
        // В мобильной/минималистичной среде alert может мешать — используем console
    }
}

// ==================== TELEGRAM БОТ ====================
let telegramSettings = {
    botToken: '',
    chatId: '',
    enabled: false,
    overdueNotifications: true,
    todayNotifications: true,
    overdueFrequency: 24,
    todayFrequency: 6,
    notifyTime: '09:00',
    lastNotification: {
        overdue: 0,
        today: 0
    }
};

let notificationInterval = null;
const MAX_MESSAGE_LENGTH = 4096;

// Улучшенное экранирование для Telegram MarkdownV2
function escapeMarkdownV2(text) {
    if (!text) return '';
    return String(text).replace(/([_*\[\]()~`>#\+\-=|{}\.!\\])/g, '\\$1');
}

// Загрузка настроек Telegram
function loadTelegramSettings() {
    try {
        const saved = localStorage.getItem('kanbanTelegramSettings');
        if (saved) {
            const settings = JSON.parse(saved);
            telegramSettings = { ...telegramSettings, ...settings };
        }
    } catch (e) {
        console.error('Ошибка загрузки настроек Telegram:', e);
    }
}

// Сохранение настроек Telegram
function saveTelegramSettings() {
    try {
        const botToken = document.getElementById('bot-token')?.value?.trim();
        const chatId = document.getElementById('chat-id')?.value?.trim();
        const overdueNotifications = document.getElementById('overdue-notifications')?.checked;
        const todayNotifications = document.getElementById('today-notifications')?.checked;
        const overdueFrequency = parseInt(document.getElementById('overdue-frequency')?.value) || 24;
        const todayFrequency = parseInt(document.getElementById('today-frequency')?.value) || 6;
        const notifyTime = document.getElementById('notify-time')?.value || '09:00';
        
        if (!botToken || !chatId) {
            showNotification('Заполните все обязательные поля', 'warning');
            return false;
        }
        
        // Проверяем формат токена
        if (!botToken.match(/^\d+:[A-Za-z0-9_-]+$/)) {
            showNotification('Неверный формат токена бота. Пример: 1234567890:ABCdefGHIjklMNOpqrsTUVwxyz', 'error');
            return false;
        }
        
        // Проверяем формат Chat ID
        if (!chatId.match(/^-?\d+$/)) {
            showNotification('Chat ID должен содержать только цифры (может быть отрицательным)', 'error');
            return false;
        }
        
        telegramSettings.botToken = botToken;
        telegramSettings.chatId = chatId;
        telegramSettings.overdueNotifications = overdueNotifications;
        telegramSettings.todayNotifications = todayNotifications;
        telegramSettings.overdueFrequency = overdueFrequency;
        telegramSettings.todayFrequency = todayFrequency;
        telegramSettings.notifyTime = notifyTime;
        telegramSettings.enabled = true;
        
        localStorage.setItem('kanbanTelegramSettings', JSON.stringify(telegramSettings));
        
        stopNotificationInterval();
        startNotificationInterval();
        
        showNotification('Настройки Telegram сохранены', 'success');
        closeTelegramModal();
        
        return true;
    } catch (e) {
        console.error('Ошибка сохранения настроек Telegram:', e);
        showNotification('Ошибка сохранения настроек', 'error');
        return false;
    }
}

// Заполнение формы настроек
function populateTelegramSettings() {
    const botToken = document.getElementById('bot-token');
    const chatId = document.getElementById('chat-id');
    const overdueNotifications = document.getElementById('overdue-notifications');
    const todayNotifications = document.getElementById('today-notifications');
    const overdueFrequency = document.getElementById('overdue-frequency');
    const todayFrequency = document.getElementById('today-frequency');
    const notifyTime = document.getElementById('notify-time');
    
    if (botToken) botToken.value = telegramSettings.botToken;
    if (chatId) chatId.value = telegramSettings.chatId;
    if (overdueNotifications) overdueNotifications.checked = telegramSettings.overdueNotifications;
    if (todayNotifications) todayNotifications.checked = telegramSettings.todayNotifications;
    if (overdueFrequency) overdueFrequency.value = telegramSettings.overdueFrequency;
    if (todayFrequency) todayFrequency.value = telegramSettings.todayFrequency;
    if (notifyTime) notifyTime.value = telegramSettings.notifyTime;
}

// Закрытие модального окна Telegram
function closeTelegramModal() {
    const telegramModal = document.getElementById('telegram-settings-modal');
    if (telegramModal) {
        telegramModal.classList.remove('show');
    }
}

// Проверка подключения к боту
async function testBotConnection() {
    const statusElement = document.getElementById('connection-status');
    const botToken = document.getElementById('bot-token')?.value?.trim();
    const chatId = document.getElementById('chat-id')?.value?.trim();
    
    if (!botToken || !chatId) {
        showNotification('Введите токен и Chat ID для проверки', 'warning');
        return;
    }
    
    if (statusElement) {
        statusElement.textContent = 'Проверяем подключение...';
        statusElement.className = 'checking';
    }
    
    try {
        const testUrl = `https://api.telegram.org/bot${botToken}/getMe`;
        const response = await fetch(testUrl, {
            headers: { 'Accept': 'application/json' }
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        if (!data.ok) throw new Error('Бот не отвечает или токен неверный');
        
        // Отправка тестового сообщения
        const messageUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
        const messageResponse = await fetch(messageUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                chat_id: chatId,
                text: '✅ Kanban Board: подключение успешно установлено!\n\nБот готов отправлять уведомления о дедлайнах задач.',
                parse_mode: 'HTML'
            })
        });
        
        if (!messageResponse.ok) {
            const errorData = await messageResponse.json();
            let errorMessage = 'Не удалось отправить сообщение';
            
            if (errorData.description?.includes('chat not found')) {
                errorMessage = 'Чат не найден. Отправьте боту /start';
            } else if (errorData.description?.includes('bot was blocked')) {
                errorMessage = 'Бот заблокирован. Разблокируйте его в Telegram';
            }
            throw new Error(errorMessage);
        }
        
        if (statusElement) {
            statusElement.textContent = '✅ Подключение установлено';
            statusElement.className = 'connected';
        }
        showNotification('Подключение к Telegram успешно установлено!', 'success');
        
    } catch (error) {
        console.error('Ошибка подключения к Telegram:', error);
        const msg = error.message || 'Неизвестная ошибка';
        if (statusElement) {
            statusElement.textContent = '❌ ' + msg.split('\n')[0];
            statusElement.className = 'disconnected';
        }
        showNotification(msg, 'error');
    }
}

// Запуск интервала уведомлений
function startNotificationInterval() {
    stopNotificationInterval();
    notificationInterval = setInterval(checkAndSendNotifications, 300000); // каждые 5 минут
    setTimeout(checkAndSendNotifications, 10000); // первый запуск через 10 сек
}

// Остановка интервала
function stopNotificationInterval() {
    if (notificationInterval) {
        clearInterval(notificationInterval);
        notificationInterval = null;
    }
}

// Проверка и отправка уведомлений
async function checkAndSendNotifications() {
    if (!telegramSettings.enabled || !telegramSettings.botToken || !telegramSettings.chatId) return;
    
    const now = Date.now();
    const [notifyHour, notifyMinute] = telegramSettings.notifyTime.split(':').map(Number);
    const currentTime = new Date();
    
    if (currentTime.getHours() < notifyHour || 
        (currentTime.getHours() === notifyHour && currentTime.getMinutes() < notifyMinute)) {
        return;
    }
    
    let sentAny = false;
    
    if (telegramSettings.overdueNotifications) {
        const overdueInterval = telegramSettings.overdueFrequency * 60 * 60 * 1000;
        if (now - telegramSettings.lastNotification.overdue >= overdueInterval) {
            if (await sendOverdueNotifications()) {
                telegramSettings.lastNotification.overdue = now;
                localStorage.setItem('kanbanTelegramSettings', JSON.stringify(telegramSettings));
                sentAny = true;
            }
        }
    }
    
    if (telegramSettings.todayNotifications) {
        const todayInterval = telegramSettings.todayFrequency * 60 * 60 * 1000;
        if (now - telegramSettings.lastNotification.today >= todayInterval) {
            if (await sendTodayNotifications()) {
                telegramSettings.lastNotification.today = now;
                localStorage.setItem('kanbanTelegramSettings', JSON.stringify(telegramSettings));
                sentAny = true;
            }
        }
    }
}

// Отправка уведомлений о просроченных задачах
async function sendOverdueNotifications() {
    const getAllTasksWithDeadlines = typeof window.getAllTasksWithDeadlines === 'function' 
        ? window.getAllTasksWithDeadlines 
        : getAllTasksWithDeadlinesFallback;
    const checkDeadlineStatus = typeof window.checkDeadlineStatus === 'function' 
        ? window.checkDeadlineStatus 
        : checkDeadlineStatusFallback;
    const formatDate = typeof window.formatDate === 'function' 
        ? window.formatDate 
        : formatDateFallback;
    
    const allTasks = getAllTasksWithDeadlines();
    const overdueTasks = allTasks.filter(task => 
        task.deadline && !task.completed && checkDeadlineStatus(task.deadline) === 'overdue'
    );
    
    if (overdueTasks.length === 0) return false;
    
    let message = '🚨 *ПРОСРОЧЕННЫЕ ЗАДАЧИ* 🚨\n\n';
    overdueTasks.slice(0, 10).forEach((task, i) => {
        message += `*${i + 1}. ${escapeMarkdownV2(task.text)}*\n📅 ${formatDate(task.deadline)}\n📋 ${escapeMarkdownV2(task.boardTitle)}\n\n`;
    });
    
    if (overdueTasks.length > 10) {
        message += `... и ещё ${overdueTasks.length - 10} задач\n\n`;
    }
    message += `Всего: *${overdueTasks.length}*\n_Следующее уведомление через ${telegramSettings.overdueFrequency} ч._`;
    
    return await sendTelegramMessageSafe(message);
}

// Отправка уведомлений о задачах на сегодня
async function sendTodayNotifications() {
    const getAllTasksWithDeadlines = typeof window.getAllTasksWithDeadlines === 'function' 
        ? window.getAllTasksWithDeadlines 
        : getAllTasksWithDeadlinesFallback;
    const checkDeadlineStatus = typeof window.checkDeadlineStatus === 'function' 
        ? window.checkDeadlineStatus 
        : checkDeadlineStatusFallback;
    const formatDate = typeof window.formatDate === 'function' 
        ? window.formatDate 
        : formatDateFallback;
    
    const allTasks = getAllTasksWithDeadlines();
    const todayTasks = allTasks.filter(task => 
        task.deadline && !task.completed && checkDeadlineStatus(task.deadline) === 'today'
    );
    
    if (todayTasks.length === 0) return false;
    
    let message = '📅 *ЗАДАЧИ НА СЕГОДНЯ* 📅\n\n';
    todayTasks.slice(0, 10).forEach((task, i) => {
        message += `*${i + 1}. ${escapeMarkdownV2(task.text)}*\n📅 ${formatDate(task.deadline)} (сегодня!)\n📋 ${escapeMarkdownV2(task.boardTitle)}\n\n`;
    });
    
    if (todayTasks.length > 10) {
        message += `... и ещё ${todayTasks.length - 10} задач\n\n`;
    }
    message += `Всего: *${todayTasks.length}*\n_Следующее уведомление через ${telegramSettings.todayFrequency} ч._`;
    
    return await sendTelegramMessageSafe(message);
}

// Безопасная отправка с повторными попытками
async function sendTelegramMessageSafe(message, retryCount = 0) {
    try {
        const success = await sendTelegramMessage(message);
        return success;
    } catch (error) {
        if (retryCount < 3) {
            await new Promise(r => setTimeout(r, 1000 * Math.pow(2, retryCount)));
            return sendTelegramMessageSafe(message, retryCount + 1);
        }
        return false;
    }
}

// Отправка сообщения в Telegram
async function sendTelegramMessage(message) {
    const url = `https://api.telegram.org/bot${telegramSettings.botToken}/sendMessage`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: telegramSettings.chatId,
            text: message.substring(0, MAX_MESSAGE_LENGTH - 100),
            parse_mode: 'MarkdownV2',
            disable_web_page_preview: true
        })
    });
    
    if (!response.ok) {
        const errorData = await response.json();
        if (errorData.description?.includes('chat not found') || errorData.description?.includes('bot was blocked')) {
            telegramSettings.enabled = false;
            localStorage.setItem('kanbanTelegramSettings', JSON.stringify(telegramSettings));
            stopNotificationInterval();
            showNotification('Telegram уведомления отключены: ' + errorData.description, 'error');
        }
        throw new Error(errorData.description || 'Ошибка отправки');
    }
    
    return true;
}

// ==================== ФОЛБЭК ФУНКЦИИ ====================
function getAllTasksWithDeadlinesFallback() {
    try {
        const allTasks = [];
        const boards = JSON.parse(localStorage.getItem('kanbanBoards') || '{}');
        Object.values(boards).forEach(board => {
            if (board?.columns?.length) {
                board.columns.forEach(column => {
                    if (column.tasks?.length) {
                        column.tasks.forEach(task => {
                            if (task.deadline) {
                                allTasks.push({ ...task, boardId: board.id, boardTitle: board.title });
                            }
                            if (task.subtasks?.length) {
                                task.subtasks.forEach(subtask => {
                                    if (subtask.deadline) {
                                        allTasks.push({
                                            ...subtask,
                                            boardId: board.id,
                                            boardTitle: board.title,
                                            parentTask: task.text,
                                            isSubtask: true
                                        });
                                    }
                                });
                            }
                        });
                    }
                });
            }
        });
        return allTasks;
    } catch (e) {
        console.error('Ошибка получения задач для Telegram:', e);
        return [];
    }
}

function checkDeadlineStatusFallback(deadline) {
    if (!deadline) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const deadlineDate = new Date(deadline);
    deadlineDate.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((deadlineDate - today) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'overdue';
    if (diffDays === 0) return 'today';
    return 'future';
}

function formatDateFallback(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
}

// Инструкция по получению Chat ID
function showChatIdInstructions() {
    const instructions = `Как получить Chat ID:\n1. Откройте Telegram\n2. Найдите бота @userinfobot\n3. Напишите ему /start\n4. Он покажет ваш Chat ID\n\nИли:\n1. Напишите своему боту /start\n2. Перейдите в браузере: https://api.telegram.org/botВАШ_ТОКЕН/getUpdates\n3. Найдите "chat":{"id":ЦИФРЫ}\n\nВведите Chat ID:`;
    const chatId = prompt(instructions, telegramSettings.chatId || '');
    if (chatId !== null) {
        const input = document.getElementById('chat-id');
        if (input) input.value = chatId.trim();
    }
}

// Инициализация Telegram бота
function initializeTelegramBot() {
    loadTelegramSettings();
    
    const telegramBtn = document.getElementById('telegram-settings-btn');
    if (telegramBtn) {
        telegramBtn.addEventListener('click', () => {
            document.getElementById('telegram-settings-modal')?.classList.add('show');
            populateTelegramSettings();
        });
    }
    
    const closeBtn = document.querySelector('#telegram-settings-modal .close-modal');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeTelegramModal);
    }
    
    const modal = document.getElementById('telegram-settings-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeTelegramModal();
        });
    }
    
    const toggleTokenBtn = document.getElementById('toggle-token-visibility');
    if (toggleTokenBtn) {
        toggleTokenBtn.addEventListener('click', () => {
            const tokenInput = document.getElementById('bot-token');
            const icon = toggleTokenBtn.querySelector('i');
            if (tokenInput && tokenInput.type === 'password') {
                tokenInput.type = 'text';
                if (icon) icon.className = 'fas fa-eye-slash';
            } else if (tokenInput) {
                tokenInput.type = 'password';
                if (icon) icon.className = 'fas fa-eye';
            }
        });
    }
    
    const getChatIdBtn = document.getElementById('get-chat-id');
    if (getChatIdBtn) getChatIdBtn.addEventListener('click', showChatIdInstructions);
    
    const testConnectionBtn = document.getElementById('test-bot-connection');
    if (testConnectionBtn) testConnectionBtn.addEventListener('click', testBotConnection);
    
    const saveBtn = document.getElementById('save-telegram-settings');
    if (saveBtn) saveBtn.addEventListener('click', saveTelegramSettings);
    
    const disableBtn = document.getElementById('disable-telegram');
    if (disableBtn) {
        disableBtn.addEventListener('click', () => {
            if (confirm('Отключить Telegram уведомления?')) {
                telegramSettings.enabled = false;
                localStorage.setItem('kanbanTelegramSettings', JSON.stringify(telegramSettings));
                stopNotificationInterval();
                showNotification('Telegram уведомления отключены', 'success');
                closeTelegramModal();
            }
        });
    }
    
    if (telegramSettings.enabled && telegramSettings.botToken && telegramSettings.chatId) {
        startNotificationInterval();
    }
}

// Запуск после загрузки DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeTelegramBot);
} else {
    initializeTelegramBot();
}