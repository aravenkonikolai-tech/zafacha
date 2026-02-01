'use strict';

// ==================== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ====================
let taskIdCounter = 0;
let subtaskIdCounter = 0;
let columnIdCounter = 0;
let boardIdCounter = 0;
let folderIdCounter = 0;
let currentBoardId = null;
let draggedTaskElement = null;
let dropIndicator = null;
let isDarkTheme = false;
let currentEditingElement = null;
let isDeadlinesViewActive = false;
let saveTimeout = null;
const DEBOUNCE_DELAY = 300;

// Интервалы для очистки
let deadlineCheckInterval = null;

// DOM элементы
let boardContainer = null;
let boardList = null;
let boardTitleElement = null;

// ==================== УТИЛИТЫ ====================
function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

function formatDate(dateString) {
    if (!dateString) return '';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) {
            return '';
        }
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        
        return `${day}.${month}.${year}`;
    } catch (e) {
        console.error('Ошибка форматирования даты:', e);
        return '';
    }
}

function checkDeadlineStatus(deadline) {
    if (!deadline) return null;
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const deadlineDate = new Date(deadline);
        if (isNaN(deadlineDate.getTime())) return null;
        
        deadlineDate.setHours(0, 0, 0, 0);
        
        const diffTime = deadlineDate.getTime() - today.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays < 0) return 'overdue';
        if (diffDays === 0) return 'today';
        return 'future';
    } catch (e) {
        console.error('Ошибка проверки дедлайна:', e);
        return null;
    }
}

function showNotification(message, type = 'info', duration = 3000) {
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(notification => {
        try {
            notification.remove();
        } catch (e) {
            console.error('Ошибка удаления уведомления:', e);
        }
    });
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;

    const icon = document.createElement('i');
    let iconClass = 'fas fa-info-circle';
    switch (type) {
        case 'success':
            iconClass = 'fas fa-check-circle';
            break;
        case 'error':
            iconClass = 'fas fa-exclamation-circle';
            break;
        case 'warning':
            iconClass = 'fas fa-exclamation-triangle';
            break;
    }
    icon.className = iconClass;

    const textSpan = document.createElement('span');
    textSpan.textContent = message;

    notification.appendChild(icon);
    notification.appendChild(textSpan);

    document.body.appendChild(notification);

    setTimeout(() => {
        try {
            notification.style.opacity = '0';
            setTimeout(() => {
                notification.remove();
            }, 300);
        } catch (e) {
            console.error('Ошибка анимации уведомления:', e);
        }
    }, duration);
}

// ==================== КОМПАКТНЫЙ РЕЖИМ ====================
function enableCompactMode() {
    try {
        document.body.classList.add('compact-mode');
        localStorage.setItem('kanbanCompactMode', 'enabled');
    } catch (e) {
        console.error('Ошибка включения компактного режима:', e);
    }
}

function disableCompactMode() {
    try {
        document.body.classList.remove('compact-mode');
        localStorage.setItem('kanbanCompactMode', 'disabled');
    } catch (e) {
        console.error('Ошибка отключения компактного режима:', e);
    }
}

function checkCompactMode() {
    try {
        const compactMode = localStorage.getItem('kanbanCompactMode');
        return compactMode === 'enabled';
    } catch (e) {
        console.error('Ошибка проверки компактного режима:', e);
        return false;
    }
}

// ==================== ТЕМА ====================
function toggleTheme() {
    try {
        isDarkTheme = !isDarkTheme;
        document.body.classList.toggle('dark-theme', isDarkTheme);
        const themeIcon = document.querySelector('.theme-toggle i');
        if (themeIcon) {
            themeIcon.className = isDarkTheme ? 'fas fa-sun' : 'fas fa-moon';
        }
        localStorage.setItem('kanbanTheme', isDarkTheme ? 'dark' : 'light');
    } catch (e) {
        console.error('Ошибка переключения темы:', e);
        showNotification('Ошибка переключения темы', 'error');
    }
}

function loadTheme() {
    try {
        const savedTheme = localStorage.getItem('kanbanTheme');
        isDarkTheme = savedTheme === 'dark';
        if (isDarkTheme) {
            document.body.classList.add('dark-theme');
            const themeIcon = document.querySelector('.theme-toggle i');
            if (themeIcon) {
                themeIcon.className = 'fas fa-sun';
            }
        }
    } catch (e) {
        console.error('Ошибка загрузки темы:', e);
    }
}

// ==================== СЧЕТЧИКИ ====================
function initializeCounters() {
    try {
        const saved = localStorage.getItem('kanbanCounters');
        if (saved) {
            const counters = JSON.parse(saved);
            taskIdCounter = counters.taskIdCounter || 0;
            subtaskIdCounter = counters.subtaskIdCounter || 0;
            columnIdCounter = counters.columnIdCounter || 0;
            boardIdCounter = counters.boardIdCounter || 0;
            folderIdCounter = counters.folderIdCounter || 0;
        }
    } catch (e) {
        console.error('Ошибка загрузки счетчиков:', e);
        resetCounters();
    }
}

function resetCounters() {
    taskIdCounter = 0;
    subtaskIdCounter = 0;
    columnIdCounter = 0;
    boardIdCounter = 0;
    folderIdCounter = 0;
    saveCounters();
}

function saveCounters() {
    try {
        const counters = {
            taskIdCounter,
            subtaskIdCounter,
            columnIdCounter,
            boardIdCounter,
            folderIdCounter
        };
        localStorage.setItem('kanbanCounters', JSON.stringify(counters));
    } catch (e) {
        console.error('Ошибка сохранения счетчиков:', e);
    }
}

function generateTaskId() {
    const id = 'task-' + (++taskIdCounter);
    saveCounters();
    return id;
}

function generateSubtaskId() {
    const id = 'subtask-' + (++subtaskIdCounter);
    saveCounters();
    return id;
}

function generateColumnId() {
    const id = 'col-' + (++columnIdCounter);
    saveCounters();
    return id;
}

function generateBoardId() {
    const id = 'board-' + (++boardIdCounter);
    saveCounters();
    return id;
}

function generateFolderId() {
    const id = 'folder-' + (++folderIdCounter);
    saveCounters();
    return id;
}

// ==================== ХРАНЕНИЕ ДАННЫХ ====================
function getAllBoards() {
    try {
        const data = localStorage.getItem('kanbanBoards');
        if (!data) return {};
        const boards = JSON.parse(data);
        if (typeof boards !== 'object' || boards === null) {
            return {};
        }
        return boards;
    } catch (e) {
        console.error('Ошибка загрузки досок:', e);
        return {};
    }
}

function saveAllBoards(boards) {
    try {
        localStorage.setItem('kanbanBoards', JSON.stringify(boards));
    } catch (e) {
        console.error('Ошибка сохранения досок:', e);
        showNotification('Ошибка сохранения данных', 'error');
    }
}

function getBoardData(boardId) {
    try {
        const boards = getAllBoards();
        return boards[boardId] || null;
    } catch (e) {
        console.error('Ошибка получения данных доски:', e);
        return null;
    }
}

function saveBoardData(boardId, data) {
    try {
        const boards = getAllBoards();
        boards[boardId] = data;
        saveAllBoards(boards);
    } catch (e) {
        console.error('Ошибка сохранения данных доски:', e);
    }
}

function deleteBoardData(boardId) {
    try {
        const boards = getAllBoards();
        delete boards[boardId];
        saveAllBoards(boards);
    } catch (e) {
        console.error('Ошибка удаления доски:', e);
    }
}

function getAllFolders() {
    try {
        const data = localStorage.getItem('kanbanFolders');
        if (!data) return {};
        const folders = JSON.parse(data);
        return typeof folders === 'object' && folders !== null ? folders : {};
    } catch (e) {
        console.error('Ошибка загрузки папок:', e);
        return {};
    }
}

function saveAllFolders(folders) {
    try {
        localStorage.setItem('kanbanFolders', JSON.stringify(folders));
    } catch (e) {
        console.error('Ошибка сохранения папок:', e);
    }
}

function createFolder(name, boardIds = []) {
    try {
        const folderId = generateFolderId();
        const folders = getAllFolders();
        folders[folderId] = {
            id: folderId,
            name: name,
            boardIds: Array.isArray(boardIds) ? boardIds : [],
            created: Date.now()
        };
        saveAllFolders(folders);
        return folderId;
    } catch (e) {
        console.error('Ошибка создания папки:', e);
        return null;
    }
}

function deleteFolder(folderId) {
    try {
        const folders = getAllFolders();
        if (!folders[folderId]) return null;
        const folderData = folders[folderId];
        delete folders[folderId];
        saveAllFolders(folders);
        return folderData;
    } catch (e) {
        console.error('Ошибка удаления папки:', e);
        return null;
    }
}

function moveBoardToFolder(boardId, folderId) {
    try {
        const folders = getAllFolders();
        if (folders[folderId] && !folders[folderId].boardIds.includes(boardId)) {
            folders[folderId].boardIds.push(boardId);
            saveAllFolders(folders);
            return true;
        }
        return false;
    } catch (e) {
        console.error('Ошибка перемещения доски в папку:', e);
        return false;
    }
}

function removeBoardFromFolder(boardId, folderId) {
    try {
        const folders = getAllFolders();
        if (folders[folderId]) {
            const index = folders[folderId].boardIds.indexOf(boardId);
            if (index > -1) {
                folders[folderId].boardIds.splice(index, 1);
                saveAllFolders(folders);
                return true;
            }
        }
        return false;
    } catch (e) {
        console.error('Ошибка удаления доски из папки:', e);
        return false;
    }
}

// ==================== ЭКСПОРТ/ИМПОРТ ====================
function exportAllData() {
    try {
        const data = {
            version: '1.0',
            exportDate: new Date().toISOString(),
            counters: {
                taskIdCounter,
                subtaskIdCounter,
                columnIdCounter,
                boardIdCounter,
                folderIdCounter
            },
            boards: getAllBoards(),
            folders: getAllFolders(),
            theme: isDarkTheme ? 'dark' : 'light',
            compactMode: checkCompactMode() ? 'enabled' : 'disabled'
        };
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `kanban-board-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
            try {
                if (a.parentNode) {
                    document.body.removeChild(a);
                }
                URL.revokeObjectURL(url);
            } catch (e) {
                console.error('Ошибка очистки ресурсов экспорта:', e);
            }
        }, 100);
        
        showNotification('База данных успешно экспортирована!', 'success');
        return true;
    } catch (error) {
        console.error('Ошибка экспорта данных:', error);
        showNotification('Ошибка экспорта данных', 'error');
        return false;
    }
}

function importAllData(jsonString) {
    try {
        const data = JSON.parse(jsonString);
        if (!data.boards) {
            throw new Error('Некорректный формат файла');
        }
        
        if (!confirm('Внимание! Импорт заменит все текущие данные. Продолжить?')) {
            return false;
        }
        
        // Сохраняем данные
        taskIdCounter = data.counters?.taskIdCounter || 0;
        subtaskIdCounter = data.counters?.subtaskIdCounter || 0;
        columnIdCounter = data.counters?.columnIdCounter || 0;
        boardIdCounter = data.counters?.boardIdCounter || 0;
        folderIdCounter = data.counters?.folderIdCounter || 0;
        saveCounters();
        
        saveAllBoards(data.boards || {});
        saveAllFolders(data.folders || {});
        
        // Применяем тему
        if (data.theme === 'dark') {
            isDarkTheme = true;
            document.body.classList.add('dark-theme');
            const themeIcon = document.querySelector('.theme-toggle i');
            if (themeIcon) {
                themeIcon.className = 'fas fa-sun';
            }
        } else {
            isDarkTheme = false;
            document.body.classList.remove('dark-theme');
        }
        
        // Восстанавливаем компактный режим
        if (data.compactMode === 'enabled') {
            setTimeout(() => enableCompactMode(), 100);
        } else {
            setTimeout(() => disableCompactMode(), 100);
        }
        
        // Перезагружаем доски
        setTimeout(() => {
            loadBoards();
            showNotification('База данных успешно импортирована!', 'success');
        }, 100);
        
        return true;
    } catch (error) {
        console.error('Ошибка импорта данных:', error);
        showNotification('Ошибка импорта данных: некорректный файл', 'error');
        return false;
    }
}

function setupExportImport() {
    try {
        // Экспорт
        const exportBtn = document.getElementById('export-data-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', exportAllData);
        }
        
        // Импорт
        const importBtn = document.getElementById('import-data-btn');
        const importModal = document.getElementById('import-modal');
        const cancelImportBtn = document.getElementById('cancel-import');
        const confirmImportBtn = document.getElementById('confirm-import');
        const browseFilesBtn = document.getElementById('browse-files-btn');
        const fileInput = document.getElementById('import-file-input');
        const fileDropArea = document.getElementById('file-drop-area');
        
        let importFileData = null;
        
        if (importBtn && importModal) {
            importBtn.addEventListener('click', () => {
                importModal.classList.add('show');
                importFileData = null;
                confirmImportBtn.disabled = true;
            });
        }
        
        const closeImportModal = () => {
            if (importModal) {
                importModal.classList.remove('show');
            }
            importFileData = null;
            if (fileDropArea) {
                fileDropArea.classList.remove('drag-over');
            }
            if (confirmImportBtn) {
                confirmImportBtn.disabled = true;
            }
        };
        
        if (cancelImportBtn) {
            cancelImportBtn.addEventListener('click', closeImportModal);
        }
        
        if (importModal) {
            importModal.addEventListener('click', (e) => {
                if (e.target === importModal) {
                    closeImportModal();
                }
            });
        }
        
        const closeModalBtn = importModal ? importModal.querySelector('.close-modal') : null;
        if (closeModalBtn) {
            closeModalBtn.addEventListener('click', closeImportModal);
        }
        
        if (browseFilesBtn && fileInput) {
            browseFilesBtn.addEventListener('click', () => {
                fileInput.click();
            });
            
            fileInput.addEventListener('change', (e) => {
                if (e.target.files && e.target.files[0]) {
                    handleFileSelect(e.target.files[0]);
                }
            });
        }
        
        // Drag & Drop
        if (fileDropArea) {
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                fileDropArea.addEventListener(eventName, preventDefaults, false);
            });
            
            function preventDefaults(e) {
                e.preventDefault();
                e.stopPropagation();
            }
            
            ['dragenter', 'dragover'].forEach(eventName => {
                fileDropArea.addEventListener(eventName, () => {
                    fileDropArea.classList.add('drag-over');
                }, false);
            });
            
            ['dragleave', 'drop'].forEach(eventName => {
                fileDropArea.addEventListener(eventName, () => {
                    fileDropArea.classList.remove('drag-over');
                }, false);
            });
            
            fileDropArea.addEventListener('drop', (e) => {
                const dt = e.dataTransfer;
                if (dt.files && dt.files[0]) {
                    handleFileSelect(dt.files[0]);
                }
            }, false);
        }
        
        function handleFileSelect(file) {
            if (!file) return;
            
            if (!file.name.endsWith('.json') && file.type !== 'application/json') {
                showNotification('Пожалуйста, выберите JSON файл', 'warning');
                return;
            }
            
            const reader = new FileReader();
            
            reader.onload = function(e) {
                try {
                    importFileData = e.target.result;
                    if (confirmImportBtn) {
                        confirmImportBtn.disabled = false;
                    }
                    showNotification('Файл загружен. Нажмите "Импортировать"', 'success');
                } catch (error) {
                    showNotification('Ошибка чтения файла', 'error');
                    if (confirmImportBtn) {
                        confirmImportBtn.disabled = true;
                    }
                }
            };
            
            reader.onerror = function() {
                showNotification('Ошибка чтения файла', 'error');
                if (confirmImportBtn) {
                    confirmImportBtn.disabled = true;
                }
            };
            
            reader.readAsText(file);
        }
        
        if (confirmImportBtn) {
            confirmImportBtn.addEventListener('click', () => {
                if (importFileData) {
                    const success = importAllData(importFileData);
                    if (success) {
                        closeImportModal();
                    }
                }
            });
        }
    } catch (e) {
        console.error('Ошибка настройки экспорта/импорта:', e);
    }
}

// ==================== СОХРАНЕНИЕ ====================
function debouncedSave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        saveCurrentBoardState();
    }, DEBOUNCE_DELAY);
}

function immediateSave() {
    clearTimeout(saveTimeout);
    saveCurrentBoardState();
}

function saveCurrentBoardState() {
    if (isDeadlinesViewActive) return;
    if (!currentBoardId) return;
    try {
        const boardData = getBoardData(currentBoardId);
        if (!boardData) return;
        updateBoardDataFromDOM(boardData);
        saveBoardData(currentBoardId, boardData);
    } catch (e) {
        console.error('Ошибка сохранения состояния доски:', e);
    }
}

function updateBoardDataFromDOM(boardData) {
    if (!boardData.columns) boardData.columns = [];
    // Очищаем задачи
    boardData.columns.forEach(column => {
        column.tasks = [];
    });
    try {
        document.querySelectorAll('.column').forEach(columnElement => {
            const columnId = columnElement.dataset.id;
            const column = boardData.columns.find(col => col.id === columnId);
            if (column) {
                column.tasks = [];
                columnElement.querySelectorAll('.task').forEach(taskElement => {
                    const taskId = taskElement.dataset.id;
                    if (!taskId) return;
                    
                    const deadlineElement = taskElement.querySelector('.deadline-indicator');
                    let deadline = null;
                    
                    if (deadlineElement) {
                        const dateText = deadlineElement.textContent.match(/\d{2}\.\d{2}\.\d{4}/);
                        if (dateText) {
                            const [day, month, year] = dateText[0].split('.');
                            deadline = new Date(year, month - 1, day).toISOString();
                        }
                    }
                    
                    const taskTextElement = taskElement.querySelector('.task-text');
                    const taskData = {
                        id: taskId,
                        text: taskTextElement ? taskTextElement.textContent : '',
                        completed: taskElement.classList.contains('completed'),
                        deadline: deadline,
                        subtasks: []
                    };
                    
                    const subtaskElements = taskElement.querySelectorAll('.subtask');
                    subtaskElements.forEach(subtaskElement => {
                        const subtaskId = subtaskElement.dataset.id;
                        if (!subtaskId) return;
                        
                        const subtaskDeadlineElement = subtaskElement.querySelector('.deadline-indicator');
                        let subtaskDeadline = null;
                        
                        if (subtaskDeadlineElement) {
                            const dateText = subtaskDeadlineElement.textContent.match(/\d{2}\.\d{2}\.\d{4}/);
                            if (dateText) {
                                const [day, month, year] = dateText[0].split('.');
                                subtaskDeadline = new Date(year, month - 1, day).toISOString();
                            }
                        }
                        
                        const subtaskTextElement = subtaskElement.querySelector('.subtask-text');
                        taskData.subtasks.push({
                            id: subtaskId,
                            text: subtaskTextElement ? subtaskTextElement.textContent : '',
                            completed: subtaskElement.classList.contains('completed'),
                            deadline: subtaskDeadline
                        });
                    });
                    
                    column.tasks.push(taskData);
                });
            }
        });
    } catch (e) {
        console.error('Ошибка обновления данных из DOM:', e);
    }
}

// ==================== РЕДАКТИРОВАНИЕ ====================
function editElement(element, onSave) {
    if (!element) return;
    const originalText = element.textContent || '';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = originalText;
    input.className = 'edit-input';
    const originalClasses = element.className.split(' ')
        .filter(cls => cls !== 'editable')
        .join(' ');

    try {
        element.replaceWith(input);
        input.focus();
        input.setSelectionRange(0, input.value.length);

        const finishEdit = function() {
            const newText = input.value.trim();
            const newElement = document.createElement(element.tagName.toLowerCase());
            newElement.className = originalClasses + ' editable';
            newElement.textContent = newText || originalText;
            
            newElement.addEventListener('click', function(e) {
                e.stopPropagation();
                editElement(this, onSave);
            });
            
            input.replaceWith(newElement);
            if (newText && newText !== originalText && onSave) {
                onSave(newText);
            }
        };

        input.addEventListener('blur', finishEdit);
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') finishEdit();
            if (e.key === 'Escape') {
                const newElement = document.createElement(element.tagName.toLowerCase());
                newElement.className = originalClasses + ' editable';
                newElement.textContent = originalText;
                newElement.addEventListener('click', function(e) {
                    e.stopPropagation();
                    editElement(this, onSave);
                });
                input.replaceWith(newElement);
            }
        });
    } catch (e) {
        console.error('Ошибка редактирования элемента:', e);
    }
}

// ==================== ДАТА И ДЕДЛАЙНЫ ====================
function setupDatePicker() {
    try {
        const modal = document.getElementById('datepicker-modal');
        if (!modal) return;
        const closeBtn = modal.querySelector('.close-modal');
        const clearBtn = document.getElementById('clear-deadline');
        const setBtn = document.getElementById('set-deadline');
        const dateInput = document.getElementById('deadline-date');
        if (!closeBtn || !clearBtn || !setBtn || !dateInput) return;
        
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        dateInput.min = todayStr;
        
        closeBtn.addEventListener('click', closeDatePicker);
        
        clearBtn.addEventListener('click', function() {
            if (currentEditingElement) {
                clearDeadline(currentEditingElement);
                closeDatePicker();
            }
        });
        
        setBtn.addEventListener('click', function() {
            if (currentEditingElement && dateInput.value) {
                setDeadline(currentEditingElement, dateInput.value);
                closeDatePicker();
            }
        });
        
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeDatePicker();
            }
        });
    } catch (e) {
        console.error('Ошибка настройки выбора даты:', e);
    }
}

function openDatePicker(element, currentDate = null) {
    try {
        const modal = document.getElementById('datepicker-modal');
        const dateInput = document.getElementById('deadline-date');
        if (!modal || !dateInput) return;
        currentEditingElement = element;
        
        if (currentDate) {
            const date = new Date(currentDate);
            if (!isNaN(date.getTime())) {
                dateInput.value = date.toISOString().split('T')[0];
            } else {
                dateInput.value = '';
            }
        } else {
            const today = new Date().toISOString().split('T')[0];
            dateInput.value = today;
        }
        
        modal.classList.add('show');
        dateInput.focus();
    } catch (e) {
        console.error('Ошибка открытия выбора даты:', e);
    }
}

function closeDatePicker() {
    try {
        const modal = document.getElementById('datepicker-modal');
        if (modal) {
            modal.classList.remove('show');
        }
        currentEditingElement = null;
    } catch (e) {
        console.error('Ошибка закрытия выбора даты:', e);
    }
}

function setDeadline(element, dateString) {
    try {
        const taskElement = element.closest('.task, .subtask');
        if (!taskElement || !dateString) return;
        const isDeadlineView = taskElement.classList.contains('deadline-view-task');
        const taskId = element.dataset.taskId || taskElement.dataset.taskId || taskElement.dataset.id;
        const isSubtask = (element.dataset.isSubtask === 'true') || 
                         (taskElement.dataset.isSubtask === 'true') || 
                         taskElement.classList.contains('subtask');
        
        // КРИТИЧНО: Для раздела сроков используем данные из dataset кнопки/элемента
        let boardId, columnId, parentTaskId;
        
        if (isDeadlineView) {
            // Берем данные из элемента, который открыл datepicker
            boardId = element.dataset.boardId;
            columnId = element.dataset.columnId;
            parentTaskId = element.dataset.parentTaskId;
        } else {
            // Обычная задача в колонке
            boardId = taskElement.dataset.boardId || currentBoardId;
        }
        
        if (!boardId || !taskId) {
            console.error('Не удалось определить boardId или taskId', {
                boardId, taskId, element, taskElement
            });
            return;
        }
        
        const boardData = getBoardData(boardId);
        if (!boardData || !boardData.columns) return;
        
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return;
        
        let found = false;
        
        for (const column of boardData.columns) {
            if (found) break;
            
            // Если знаем конкретную колонку, пропускаем другие
            if (columnId && column.id !== columnId) continue;
            
            for (const task of column.tasks) {
                if (task.id === taskId && !isSubtask) {
                    task.deadline = date.toISOString();
                    found = true;
                    break;
                }
                
                // Для подзадачи проверяем parentTaskId
                if (isSubtask && task.subtasks && Array.isArray(task.subtasks)) {
                    for (const subtask of task.subtasks) {
                        if (subtask.id === taskId) {
                            subtask.deadline = date.toISOString();
                            found = true;
                            break;
                        }
                    }
                }
                if (found) break;
            }
        }
        
        if (found) {
            saveBoardData(boardId, boardData);
            updateDeadlineDisplay(taskElement, date.toISOString());
            
            // Обновляем раздел сроков, если мы в нем
            if (isDeadlineView) {
                setTimeout(() => {
                    openDeadlinesView();
                }, 100);
            }
        }
    } catch (e) {
        console.error('Ошибка установки дедлайна', e);
        showNotification('Ошибка установки дедлайна', 'error');
    }
}

function clearDeadline(element) {
    try {
        const taskElement = element.closest('.task, .subtask');
        if (!taskElement) return;
        const isDeadlineView = taskElement.classList.contains('deadline-view-task');
        const taskId = element.dataset.taskId || taskElement.dataset.taskId || taskElement.dataset.id;
        const isSubtask = (element.dataset.isSubtask === 'true') || 
                         (taskElement.dataset.isSubtask === 'true') || 
                         taskElement.classList.contains('subtask');
        
        // КРИТИЧНО: Для раздела сроков используем данные из dataset
        let boardId, columnId, parentTaskId;
        
        if (isDeadlineView) {
            boardId = element.dataset.boardId;
            columnId = element.dataset.columnId;
            parentTaskId = element.dataset.parentTaskId;
        } else {
            boardId = taskElement.dataset.boardId || currentBoardId;
        }
        
        if (!boardId || !taskId) {
            console.error('Не удалось определить boardId или taskId', {
                boardId, taskId, element, taskElement
            });
            return;
        }
        
        const boardData = getBoardData(boardId);
        if (!boardData || !boardData.columns) return;
        
        let found = false;
        
        for (const column of boardData.columns) {
            if (found) break;
            
            if (columnId && column.id !== columnId) continue;
            
            for (const task of column.tasks) {
                if (task.id === taskId && !isSubtask) {
                    task.deadline = null;
                    found = true;
                    break;
                }
                
                if (isSubtask && task.subtasks && Array.isArray(task.subtasks)) {
                    for (const subtask of task.subtasks) {
                        if (subtask.id === taskId) {
                            subtask.deadline = null;
                            found = true;
                            break;
                        }
                    }
                }
                if (found) break;
            }
        }
        
        if (found) {
            saveBoardData(boardId, boardData);
            updateDeadlineDisplay(taskElement, null);
            
            // Обновляем раздел сроков, если мы в нем
            if (isDeadlineView) {
                setTimeout(() => {
                    openDeadlinesView();
                }, 100);
            }
        }
    } catch (e) {
        console.error('Ошибка очистки дедлайна', e);
        showNotification('Ошибка очистки дедлайна', 'error');
    }
}

function updateDeadlineDisplay(taskElement, date) {
    try {
        const isSubtask = taskElement.classList.contains('subtask');
        const deadlineIndicator = taskElement.querySelector('.deadline-indicator');
        const deadlineRow = taskElement.querySelector('.deadline-row');
        const calendarBtn = taskElement.querySelector(isSubtask ? '.subtask-calendar-btn' : '.task-calendar-btn');
        
        if (date) {
            const status = checkDeadlineStatus(date);
            const formattedDate = formatDate(date);
            
            if (!deadlineRow) {
                const newDeadlineRow = document.createElement('div');
                newDeadlineRow.className = 'deadline-row';
                
                const deadlineSpan = document.createElement('span');
                deadlineSpan.className = `deadline-indicator ${status}`;
                
                const icon = document.createElement('i');
                icon.className = 'far fa-calendar-alt';
                deadlineSpan.appendChild(icon);
                deadlineSpan.appendChild(document.createTextNode(` ${formattedDate}`));
                
                newDeadlineRow.appendChild(deadlineSpan);
                
                const contentElement = taskElement.querySelector(isSubtask ? '.subtask-content' : '.task-content');
                if (contentElement) {
                    const mainRow = contentElement.querySelector(isSubtask ? '.subtask-main-row' : '.task-main-row');
                    if (mainRow && mainRow.nextSibling) {
                        contentElement.insertBefore(newDeadlineRow, mainRow.nextSibling);
                    } else {
                        contentElement.appendChild(newDeadlineRow);
                    }
                }
            } else if (deadlineIndicator) {
                deadlineIndicator.className = `deadline-indicator ${status}`;
                deadlineIndicator.innerHTML = `<i class="far fa-calendar-alt"></i> ${escapeHtml(formattedDate)}`;
            }
            
            if (!isSubtask) {
                if (status === 'overdue') {
                    taskElement.classList.add('deadline-overdue');
                    taskElement.classList.remove('deadline-today');
                } else if (status === 'today') {
                    taskElement.classList.add('deadline-today');
                    taskElement.classList.remove('deadline-overdue');
                } else {
                    taskElement.classList.remove('deadline-overdue', 'deadline-today');
                }
            }
            
            if (calendarBtn) {
                const icon = calendarBtn.querySelector('i');
                if (icon) {
                    icon.className = 'fas fa-calendar-alt';
                }
                calendarBtn.title = 'Изменить срок';
            }
        } else {
            if (deadlineRow) {
                deadlineRow.remove();
            }
            if (!isSubtask) {
                taskElement.classList.remove('deadline-overdue', 'deadline-today');
            }
            
            if (calendarBtn) {
                const icon = calendarBtn.querySelector('i');
                if (icon) {
                    icon.className = 'far fa-calendar-alt';
                }
                calendarBtn.title = 'Установить срок';
            }
        }
    } catch (e) {
        console.error('Ошибка обновления отображения дедлайна:', e);
    }
}

// ==================== ДОСКИ ====================
function loadBoards() {
    try {
        const boards = getAllBoards();
        const folders = getAllFolders();
        if (!boardList) boardList = document.getElementById('boards-list');
        if (!boardList) return;
        
        boardList.innerHTML = '';
        
        const boardIds = Object.keys(boards);
        const folderIds = Object.keys(folders);
        const boardsInFolders = new Set();
        
        Object.values(folders).forEach(folder => {
            if (folder && folder.boardIds && Array.isArray(folder.boardIds)) {
                folder.boardIds.forEach(id => boardsInFolders.add(id));
            }
        });
        
        folderIds.forEach(folderId => {
            const folderData = folders[folderId];
            if (folderData && folderData.name) {
                createFolderListItem(folderId, folderData);
            }
        });
        
        if (folderIds.length > 0) {
            const soloBoards = boardIds.filter(id => !boardsInFolders.has(id));
            if (soloBoards.length > 0) {
                const divider = document.createElement('li');
                divider.className = 'boards-divider';
                
                const span = document.createElement('span');
                span.textContent = 'Доски без папки';
                divider.appendChild(span);
                
                boardList.appendChild(divider);
            }
        }
        
        boardIds.forEach(boardId => {
            if (!boardsInFolders.has(boardId)) {
                const boardData = boards[boardId];
                if (boardData && boardData.title) {
                    createBoardListItem(boardId, boardData.title);
                }
            }
        });
        
        if (boardIds.length === 0) {
            showWelcomeScreen();
        } else {
            const availableBoardIds = boardIds.filter(id => !boardsInFolders.has(id));
            if (availableBoardIds.length > 0) {
                openBoard(availableBoardIds[0]);
            } else if (boardIds.length > 0) {
                openBoard(boardIds[0]);
            }
        }
    } catch (error) {
        console.error('Ошибка загрузки досок:', error);
        showWelcomeScreen();
    }
}

function showWelcomeScreen() {
    try {
        if (!boardContainer) boardContainer = document.getElementById('board');
        if (!boardTitleElement) boardTitleElement = document.getElementById('board-title');
        if (!boardContainer || !boardTitleElement) return;
        boardTitleElement.textContent = 'Добро пожаловать в Kanban Board!';
        
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        
        const icon = document.createElement('i');
        icon.className = 'fas fa-clipboard-list';
        
        const heading = document.createElement('h3');
        heading.textContent = 'Создайте свою первую доску';
        
        const paragraph = document.createElement('p');
        paragraph.textContent = 'Начните организовывать задачи, проекты и идеи';
        
        const button = document.createElement('button');
        button.id = 'create-first-board';
        button.className = 'sidebar-btn';
        button.style.cssText = 'max-width: 200px; margin: 0 auto;';
        
        const buttonIcon = document.createElement('i');
        buttonIcon.className = 'fas fa-plus';
        button.appendChild(buttonIcon);
        button.appendChild(document.createTextNode(' Создать доску'));
        
        emptyState.appendChild(icon);
        emptyState.appendChild(heading);
        emptyState.appendChild(paragraph);
        emptyState.appendChild(button);
        
        boardContainer.innerHTML = '';
        boardContainer.appendChild(emptyState);
        
        button.addEventListener('click', () => {
            createBoard('Моя первая доска');
        });
    } catch (e) {
        console.error('Ошибка отображения экрана приветствия:', e);
    }
}

function createBoard(title) {
    try {
        const boardId = generateBoardId();
        const boardData = {
            id: boardId,
            title: title,
            columns: [
                {
                    id: generateColumnId(),
                    title: 'Запланировано',
                    tasks: []
                },
                {
                    id: generateColumnId(),
                    title: 'В работе',
                    tasks: []
                },
                {
                    id: generateColumnId(),
                    title: 'Готово',
                    tasks: []
                }
            ],
            created: Date.now()
        };
        saveBoardData(boardId, boardData);
        createBoardListItem(boardId, title);
        openBoard(boardId);
    } catch (e) {
        console.error('Ошибка создания доски:', e);
        showNotification('Ошибка создания доски', 'error');
    }
}

function createBoardListItem(boardId, title) {
    try {
        if (!boardList) boardList = document.getElementById('boards-list');
        if (!boardList) return null;
        const li = document.createElement('li');
        li.dataset.id = boardId;
        li.dataset.type = 'board';
        li.draggable = true;
        
        const boardItem = document.createElement('div');
        boardItem.className = 'board-item';
        
        const boardName = document.createElement('span');
        boardName.className = 'board-name';
        boardName.textContent = escapeHtml(title);
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'board-delete-btn';
        deleteBtn.title = 'Удалить доску';
        
        const deleteIcon = document.createElement('i');
        deleteIcon.className = 'fas fa-trash';
        deleteBtn.appendChild(deleteIcon);
        
        boardItem.appendChild(boardName);
        boardItem.appendChild(deleteBtn);
        li.appendChild(boardItem);
        
        boardName.addEventListener('click', () => {
            const deadlinesBtn = document.getElementById('deadlines-btn');
            if (deadlinesBtn) {
                deadlinesBtn.classList.remove('active');
            }
            isDeadlinesViewActive = false;
            openBoard(boardId);
        });
        
        deleteBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            e.preventDefault();
            
            const boardData = getBoardData(boardId);
            if (!boardData) return;
            
            if (confirm(`Удалить доску "${boardData.title}"? Все задачи будут потеряны.`)) {
                const folders = getAllFolders();
                Object.keys(folders).forEach(folderId => {
                    const folder = folders[folderId];
                    if (folder && folder.boardIds && folder.boardIds.includes(boardId)) {
                        removeBoardFromFolder(boardId, folderId);
                    }
                });
                
                deleteBoardData(boardId);
                li.remove();
                
                if (currentBoardId === boardId) {
                    const boards = getAllBoards();
                    const boardIds = Object.keys(boards);
                    if (boardIds.length > 0) {
                        openBoard(boardIds[0]);
                    } else {
                        showWelcomeScreen();
                    }
                }
            }
        });
        
        setupBoardDragAndDrop(li, boardId, 'board');
        boardList.appendChild(li);
        return li;
    } catch (e) {
        console.error('Ошибка создания элемента списка досок:', e);
        return null;
    }
}

function createFolderListItem(folderId, folderData) {
    try {
        if (!boardList) boardList = document.getElementById('boards-list');
        if (!boardList) return null;
        const li = document.createElement('li');
        li.dataset.id = folderId;
        li.dataset.type = 'folder';
        li.classList.add('folder-item');
        li.draggable = true;
        
        const folderHeader = document.createElement('div');
        folderHeader.className = 'folder-header';
        
        const expandIcon = document.createElement('span');
        expandIcon.className = 'folder-expand-icon';
        expandIcon.textContent = '▶';
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'folder-name editable';
        nameSpan.textContent = escapeHtml(folderData.name);
        
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'folder-actions';
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'folder-delete-btn';
        deleteBtn.title = 'Удалить папку';
        
        const deleteIcon = document.createElement('i');
        deleteIcon.className = 'fas fa-trash';
        deleteBtn.appendChild(deleteIcon);
        
        actionsDiv.appendChild(deleteBtn);
        
        folderHeader.appendChild(expandIcon);
        folderHeader.appendChild(nameSpan);
        folderHeader.appendChild(actionsDiv);
        
        const ul = document.createElement('ul');
        ul.className = 'folder-boards';
        ul.style.display = 'none';
        
        if (folderData.boardIds && Array.isArray(folderData.boardIds)) {
            folderData.boardIds.forEach(boardId => {
                const boardData = getBoardData(boardId);
                if (boardData) {
                    const nestedLi = createBoardInFolderItem(boardId, boardData.title, folderId);
                    if (nestedLi) {
                        ul.appendChild(nestedLi);
                    }
                }
            });
        }
        
        li.appendChild(folderHeader);
        li.appendChild(ul);
        
        expandIcon.addEventListener('click', function(e) {
            e.stopPropagation();
            const isHidden = ul.style.display === 'none';
            ul.style.display = isHidden ? 'block' : 'none';
            this.textContent = isHidden ? '▼' : '▶';
        });
        
        nameSpan.addEventListener('click', function(e) {
            e.stopPropagation();
            editElement(this, function(newText) {
                const folders = getAllFolders();
                if (folders[folderId]) {
                    folders[folderId].name = newText;
                    saveAllFolders(folders);
                }
            });
        });
        
        deleteBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            e.preventDefault();
            
            if (confirm(`Удалить папку "${folderData.name}"? Все доски из папки будут перемещены в общий список.`)) {
                const deletedFolder = deleteFolder(folderId);
                
                if (deletedFolder && deletedFolder.boardIds) {
                    deletedFolder.boardIds.forEach(boardId => {
                        const boardData = getBoardData(boardId);
                        if (boardData) {
                            createBoardListItem(boardId, boardData.title);
                        }
                    });
                }
                
                li.remove();
                loadBoards();
            }
        });
        
        setupFolderDragAndDrop(li, folderId, ul);
        boardList.appendChild(li);
        return li;
    } catch (e) {
        console.error('Ошибка создания элемента списка папок:', e);
        return null;
    }
}

function createBoardInFolderItem(boardId, title, folderId) {
    try {
        const nestedLi = document.createElement('li');
        nestedLi.dataset.id = boardId;
        nestedLi.dataset.type = 'board-inside-folder';
        nestedLi.dataset.parentFolder = folderId;
        nestedLi.draggable = true;
        
        const boardItem = document.createElement('div');
        boardItem.className = 'board-item';
        
        const boardName = document.createElement('span');
        boardName.className = 'board-name';
        boardName.textContent = `→ ${escapeHtml(title)}`;
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'board-delete-btn';
        deleteBtn.title = 'Удалить доску';
        
        const deleteIcon = document.createElement('i');
        deleteIcon.className = 'fas fa-trash';
        deleteBtn.appendChild(deleteIcon);
        
        boardItem.appendChild(boardName);
        boardItem.appendChild(deleteBtn);
        nestedLi.appendChild(boardItem);
        
        boardName.addEventListener('click', function(e) {
            e.stopPropagation();
            const deadlinesBtn = document.getElementById('deadlines-btn');
            if (deadlinesBtn) {
                deadlinesBtn.classList.remove('active');
            }
            isDeadlinesViewActive = false;
            openBoard(boardId);
        });
        
        deleteBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            e.preventDefault();
            
            const boardData = getBoardData(boardId);
            if (!boardData) return;
            
            if (confirm(`Удалить доску "${boardData.title}"? Все задачи будут потеряны.`)) {
                removeBoardFromFolder(boardId, folderId);
                deleteBoardData(boardId);
                nestedLi.remove();
                
                if (currentBoardId === boardId) {
                    const boards = getAllBoards();
                    const boardIds = Object.keys(boards);
                    if (boardIds.length > 0) {
                        openBoard(boardIds[0]);
                    } else {
                        showWelcomeScreen();
                    }
                }
            }
        });
        
        nestedLi.addEventListener('dragstart', function(e) {
            e.dataTransfer.setData('text/plain', `board-inside-folder:${boardId}:${folderId}`);
            e.dataTransfer.effectAllowed = 'move';
            e.stopPropagation();
        });
        
        return nestedLi;
    } catch (e) {
        console.error('Ошибка создания элемента доски в папке:', e);
        return null;
    }
}

// ==================== DRAG & DROP ====================
function setupBoardDragAndDrop(element, boardId, type) {
    if (!element) return;
    element.addEventListener('dragstart', function(e) {
        e.dataTransfer.setData('text/plain', `${type}:${boardId}`);
        e.dataTransfer.effectAllowed = 'move';
    });
    element.addEventListener('dragover', function(e) {
        e.preventDefault();
        if (e.dataTransfer.types.includes('text/plain')) {
            e.dataTransfer.dropEffect = 'move';
            this.classList.add('drag-over');
        }
    });

    element.addEventListener('dragleave', function(e) {
        if (!this.contains(e.relatedTarget)) {
            this.classList.remove('drag-over');
        }
    });

    element.addEventListener('drop', function(e) {
        e.preventDefault();
        this.classList.remove('drag-over');
    });
}

function setupFolderDragAndDrop(folderElement, folderId, folderContent) {
    if (!folderElement || !folderContent) return;
    folderElement.addEventListener('dragover', function(e) {
        e.preventDefault();
        const data = e.dataTransfer.getData('text/plain');
        if (data.startsWith('board:') || data.startsWith('board-inside-folder:')) {
            e.dataTransfer.dropEffect = 'move';
            this.classList.add('drag-over');
            
            const rect = folderContent.getBoundingClientRect();
            if (e.clientY > rect.top && e.clientY < rect.bottom) {
                folderContent.classList.add('drag-over');
            } else {
                folderContent.classList.remove('drag-over');
            }
        }
    });

    folderElement.addEventListener('dragenter', function(e) {
        if (e.dataTransfer.types.includes('text/plain')) {
            this.classList.add('drag-over');
        }
    });

    folderElement.addEventListener('dragleave', function(e) {
        if (!this.contains(e.relatedTarget)) {
            this.classList.remove('drag-over');
            folderContent.classList.remove('drag-over');
        }
    });

    folderElement.addEventListener('drop', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        this.classList.remove('drag-over');
        folderContent.classList.remove('drag-over');
        
        const data = e.dataTransfer.getData('text/plain');
        
        if (data.startsWith('board:')) {
            const sourceBoardId = data.split(':')[1];
            if (sourceBoardId !== folderId) {
                handleBoardDropToFolder(sourceBoardId, folderId, folderContent);
            }
        } else if (data.startsWith('board-inside-folder:')) {
            const parts = data.split(':');
            const sourceBoardId = parts[1];
            const sourceFolderId = parts[2];
            
            if (sourceFolderId !== folderId) {
                handleBoardMoveBetweenFolders(sourceBoardId, sourceFolderId, folderId, folderContent);
            }
        }
    });

    folderElement.addEventListener('dragstart', function(e) {
        e.dataTransfer.setData('text/plain', `folder:${folderId}`);
        e.dataTransfer.effectAllowed = 'move';
    });
}

function handleBoardDropToFolder(boardId, folderId, folderContent) {
    try {
        const sourceLi = document.querySelector(`#boards-list li[data-id="${boardId}"]`);
        if (sourceLi && sourceLi.dataset.type === 'board') {
            sourceLi.remove();
        }
        if (moveBoardToFolder(boardId, folderId)) {
            const expandIcon = folderContent.parentElement.querySelector('.folder-expand-icon');
            if (folderContent.style.display === 'none') {
                folderContent.style.display = 'block';
                if (expandIcon) {
                    expandIcon.textContent = '▼';
                }
            }
            
            const boardData = getBoardData(boardId);
            if (boardData) {
                const nestedLi = createBoardInFolderItem(boardId, boardData.title, folderId);
                if (nestedLi) {
                    folderContent.appendChild(nestedLi);
                }
            }
        }
    } catch (e) {
        console.error('Ошибка перемещения доски в папку:', e);
    }
}

function handleBoardMoveBetweenFolders(boardId, sourceFolderId, targetFolderId, targetFolderContent) {
    try {
        if (removeBoardFromFolder(boardId, sourceFolderId) && moveBoardToFolder(boardId, targetFolderId)) {
            const sourceFolderElement = document.querySelector(`#boards-list li[data-id="${sourceFolderId}"]`);
            if (sourceFolderElement) {
                const sourceFolderContent = sourceFolderElement.querySelector('.folder-boards');
                const sourceNestedLi = sourceFolderContent ? sourceFolderContent.querySelector(`li[data-id="${boardId}"]`) : null;
                if (sourceNestedLi) {
                    sourceNestedLi.remove();
                }
            }
            
            const expandIcon = targetFolderContent.parentElement.querySelector('.folder-expand-icon');
            if (targetFolderContent.style.display === 'none') {
                targetFolderContent.style.display = 'block';
                if (expandIcon) {
                    expandIcon.textContent = '▼';
                }
            }
            
            const boardData = getBoardData(boardId);
            if (boardData) {
                const nestedLi = createBoardInFolderItem(boardId, boardData.title, targetFolderId);
                if (nestedLi) {
                    targetFolderContent.appendChild(nestedLi);
                }
            }
        }
    } catch (e) {
        console.error('Ошибка перемещения доски между папками:', e);
    }
}

// ==================== КОЛОНКИ И ЗАДАЧИ ====================
function openBoard(boardId) {
    try {
        const boardData = getBoardData(boardId);
        if (!boardData) {
            showWelcomeScreen();
            return;
        }
        currentBoardId = boardId;
        isDeadlinesViewActive = false;
        
        if (!boardTitleElement) boardTitleElement = document.getElementById('board-title');
        if (!boardContainer) boardContainer = document.getElementById('board');
        
        if (!boardTitleElement || !boardContainer) return;
        
        boardTitleElement.textContent = boardData.title;
        boardContainer.innerHTML = '';
        
        if (boardData.columns && Array.isArray(boardData.columns)) {
            boardData.columns.forEach(columnData => {
                const columnElement = createColumnElement(columnData);
                if (columnElement) {
                    boardContainer.appendChild(columnElement);
                }
            });
        } else {
            const defaultColumns = [
                { id: generateColumnId(), title: 'Запланировано', tasks: [] },
                { id: generateColumnId(), title: 'В работе', tasks: [] },
                { id: generateColumnId(), title: 'Готово', tasks: [] }
            ];
            
            defaultColumns.forEach(columnData => {
                const columnElement = createColumnElement(columnData);
                if (columnElement) {
                    boardContainer.appendChild(columnElement);
                }
            });
            
            boardData.columns = defaultColumns;
            saveBoardData(boardId, boardData);
        }
        
        document.querySelectorAll('#boards-list li').forEach(li => {
            li.classList.remove('active');
            if (li.dataset.id === boardId && li.dataset.type === 'board') {
                li.classList.add('active');
            }
            if (li.dataset.type === 'board-inside-folder' && li.dataset.id === boardId) {
                li.classList.add('active');
            }
        });
        
        setTimeout(() => {
            if (checkCompactMode()) {
                enableCompactMode();
            }
        }, 100);
    } catch (e) {
        console.error('Ошибка открытия доски:', e);
        showNotification('Ошибка загрузки доски', 'error');
    }
}

function createColumnElement(columnData) {
    try {
        const column = document.createElement('div');
        column.className = 'column';
        column.dataset.id = columnData.id;
        
        const columnHeader = document.createElement('div');
        columnHeader.className = 'column-header';
        
        const titleElement = document.createElement('h2');
        titleElement.className = 'column-title editable';
        titleElement.textContent = escapeHtml(columnData.title);
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-column-btn';
        deleteBtn.title = 'Удалить колонку';
        
        const deleteIcon = document.createElement('i');
        deleteIcon.className = 'fas fa-minus';
        deleteBtn.appendChild(deleteIcon);
        
        columnHeader.appendChild(titleElement);
        columnHeader.appendChild(deleteBtn);
        
        const tasksContainer = document.createElement('div');
        tasksContainer.className = 'tasks';
        
        column.appendChild(columnHeader);
        column.appendChild(tasksContainer);
        
        titleElement.addEventListener('click', function(e) {
            e.stopPropagation();
            editElement(this, function(newText) {
                updateColumnTitle(columnData.id, newText);
                immediateSave();
            });
        });
        
        deleteBtn.addEventListener('click', function() {
            const columns = document.querySelectorAll('#board .column');
            
            if (columns.length <= 1) {
                alert('Должна остаться хотя бы одна колонка');
                return;
            }
            
            if (confirm(`Удалить колонку "${columnData.title}"?`)) {
                column.remove();
                deleteColumn(columnData.id);
                immediateSave();
            }
        });
        
        tasksContainer.addEventListener('click', function(e) {
            if (e.target.closest('.task') || e.target.closest('.subtask')) return;
            
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'edit-input task-add-input';
            input.placeholder = 'Введите задачу...';
            tasksContainer.appendChild(input);
            input.focus();
            
            const finishEdit = function() {
                const text = input.value.trim();
                input.remove();
                if (text) {
                    addTaskToColumn(columnData.id, text);
                    immediateSave();
                }
            };
            
            input.addEventListener('blur', finishEdit);
            input.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') finishEdit();
            });
        });
        
        if (columnData.tasks && Array.isArray(columnData.tasks)) {
            columnData.tasks.forEach(taskData => {
                const taskElement = createTaskElement(taskData);
                if (taskElement) {
                    tasksContainer.appendChild(taskElement);
                }
            });
        }
        
        setupColumnDrop(column);
        return column;
    } catch (e) {
        console.error('Ошибка создания колонки:', e);
        return null;
    }
}

function updateColumnTitle(columnId, newTitle) {
    try {
        if (!currentBoardId) return;
        const boardData = getBoardData(currentBoardId);
        if (!boardData || !boardData.columns) return;
        const column = boardData.columns.find(col => col.id === columnId);
        if (column) {
            column.title = newTitle;
            saveBoardData(currentBoardId, boardData);
        }
    } catch (e) {
        console.error('Ошибка обновления названия колонки:', e);
    }
}

function deleteColumn(columnId) {
    try {
        if (!currentBoardId) return;
        const boardData = getBoardData(currentBoardId);
        if (!boardData || !boardData.columns) return;
        const columnIndex = boardData.columns.findIndex(col => col.id === columnId);
        if (columnIndex === -1) return;
        
        boardData.columns.splice(columnIndex, 1);
        saveBoardData(currentBoardId, boardData);
    } catch (e) {
        console.error('Ошибка удаления колонки:', e);
    }
}

function addTaskToColumn(columnId, text) {
    try {
        if (!currentBoardId) return;
        const taskId = generateTaskId();
        const taskData = {
            id: taskId,
            text: text,
            completed: false,
            deadline: null,
            subtasks: []
        };
        const taskElement = createTaskElement(taskData);
        const column = document.querySelector(`.column[data-id="${columnId}"]`);
        if (column && taskElement) {
            const tasksContainer = column.querySelector('.tasks');
            if (tasksContainer) {
                tasksContainer.appendChild(taskElement);
                debouncedSave();
            }
        }
    } catch (e) {
        console.error('Ошибка добавления задачи в колонку:', e);
    }
}

function createTaskElement(taskData) {
    try {
        const task = document.createElement('div');
        task.className = 'task';
        if (taskData.completed) task.classList.add('completed');
        task.dataset.id = taskData.id;
        task.dataset.boardId = currentBoardId;  // КРИТИЧЕСКИ ВАЖНО: сохраняем boardId
        task.draggable = true;
        
        if (taskData.deadline) {
            const status = checkDeadlineStatus(taskData.deadline);
            if (status === 'overdue') task.classList.add('deadline-overdue');
            if (status === 'today') task.classList.add('deadline-today');
        }
        
        const taskContent = document.createElement('div');
        taskContent.className = 'task-content';
        
        const mainRow = document.createElement('div');
        mainRow.className = 'task-main-row';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'checkbox';
        if (taskData.completed) checkbox.checked = true;
        
        const textElement = document.createElement('span');
        textElement.className = 'task-text editable';
        textElement.textContent = escapeHtml(taskData.text);
        
        const calendarBtn = document.createElement('button');
        calendarBtn.className = 'task-calendar-btn';
        calendarBtn.title = taskData.deadline ? 'Изменить срок' : 'Установить срок';
        
        const calendarIcon = document.createElement('i');
        calendarIcon.className = taskData.deadline ? 'fas fa-calendar-alt' : 'far fa-calendar-alt';
        calendarBtn.appendChild(calendarIcon);
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.title = 'Удалить задачу';
        
        const deleteIcon = document.createElement('i');
        deleteIcon.className = 'fas fa-trash';
        deleteBtn.appendChild(deleteIcon);
        
        mainRow.appendChild(checkbox);
        mainRow.appendChild(textElement);
        mainRow.appendChild(calendarBtn);
        mainRow.appendChild(deleteBtn);
        
        taskContent.appendChild(mainRow);
        
        if (taskData.deadline) {
            const status = checkDeadlineStatus(taskData.deadline);
            const formattedDate = formatDate(taskData.deadline);
            
            const deadlineRow = document.createElement('div');
            deadlineRow.className = 'deadline-row';
            
            const deadlineIndicator = document.createElement('span');
            deadlineIndicator.className = `deadline-indicator ${status}`;
            
            const deadlineIcon = document.createElement('i');
            deadlineIcon.className = 'far fa-calendar-alt';
            deadlineIndicator.appendChild(deadlineIcon);
            deadlineIndicator.appendChild(document.createTextNode(` ${escapeHtml(formattedDate)}`));
            
            deadlineRow.appendChild(deadlineIndicator);
            taskContent.appendChild(deadlineRow);
        }
        
        task.appendChild(taskContent);
        
        const subtasksContainer = document.createElement('div');
        subtasksContainer.className = 'subtasks';
        task.appendChild(subtasksContainer);
        
        const addSubtaskBtn = document.createElement('button');
        addSubtaskBtn.className = 'add-subtask-btn';
        
        const plusIcon = document.createElement('i');
        plusIcon.className = 'fas fa-plus';
        addSubtaskBtn.appendChild(plusIcon);
        addSubtaskBtn.appendChild(document.createTextNode(' Подзадача'));
        
        task.appendChild(addSubtaskBtn);
        
        checkbox.addEventListener('change', function() {
            const isCompleted = this.checked;
            task.classList.toggle('completed', isCompleted);
            debouncedSave();
        });
        
        textElement.addEventListener('click', function(e) {
            e.stopPropagation();
            editElement(this, function(newText) {
                debouncedSave();
            });
        });
        
        calendarBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            openDatePicker(this, taskData.deadline);
        });
        
        deleteBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (confirm('Удалить задачу?')) {
                task.remove();
                immediateSave();
            }
        });
        
        addSubtaskBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            addSubtaskToTaskElement(task);
        });
        
        if (taskData.subtasks && Array.isArray(taskData.subtasks)) {
            taskData.subtasks.forEach(subtaskData => {
                const subtaskElement = createSubtaskElement(subtaskData);
                if (subtaskElement) {
                    subtasksContainer.appendChild(subtaskElement);
                }
            });
        }
        
        setupTaskDragAndDrop(task);
        return task;
    } catch (e) {
        console.error('Ошибка создания элемента задачи:', e);
        return null;
    }
}

function createSubtaskElement(subtaskData) {
    try {
        const subtask = document.createElement('div');
        subtask.className = 'subtask';
        if (subtaskData.completed) subtask.classList.add('completed');
        subtask.dataset.id = subtaskData.id;
        
        const subtaskContent = document.createElement('div');
        subtaskContent.className = 'subtask-content';
        
        const mainRow = document.createElement('div');
        mainRow.className = 'subtask-main-row';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'checkbox';
        if (subtaskData.completed) checkbox.checked = true;
        
        const textElement = document.createElement('span');
        textElement.className = 'subtask-text editable';
        textElement.textContent = escapeHtml(subtaskData.text);
        
        const calendarBtn = document.createElement('button');
        calendarBtn.className = 'subtask-calendar-btn';
        calendarBtn.title = subtaskData.deadline ? 'Изменить срок' : 'Установить срок';
        
        const calendarIcon = document.createElement('i');
        calendarIcon.className = subtaskData.deadline ? 'fas fa-calendar-alt' : 'far fa-calendar-alt';
        calendarBtn.appendChild(calendarIcon);
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'subtask-delete-btn';
        deleteBtn.title = 'Удалить подзадачу';
        
        const deleteIcon = document.createElement('i');
        deleteIcon.className = 'fas fa-trash';
        deleteBtn.appendChild(deleteIcon);
        
        mainRow.appendChild(checkbox);
        mainRow.appendChild(textElement);
        mainRow.appendChild(calendarBtn);
        mainRow.appendChild(deleteBtn);
        
        subtaskContent.appendChild(mainRow);
        
        if (subtaskData.deadline) {
            const status = checkDeadlineStatus(subtaskData.deadline);
            const formattedDate = formatDate(subtaskData.deadline);
            
            const deadlineRow = document.createElement('div');
            deadlineRow.className = 'deadline-row';
            
            const deadlineIndicator = document.createElement('span');
            deadlineIndicator.className = `deadline-indicator ${status}`;
            
            const deadlineIcon = document.createElement('i');
            deadlineIcon.className = 'far fa-calendar-alt';
            deadlineIndicator.appendChild(deadlineIcon);
            deadlineIndicator.appendChild(document.createTextNode(` ${escapeHtml(formattedDate)}`));
            
            deadlineRow.appendChild(deadlineIndicator);
            subtaskContent.appendChild(deadlineRow);
        }
        
        subtask.appendChild(subtaskContent);
        
        checkbox.addEventListener('change', function() {
            const isCompleted = this.checked;
            subtask.classList.toggle('completed', isCompleted);
            debouncedSave();
        });
        
        textElement.addEventListener('click', function(e) {
            e.stopPropagation();
            editElement(this, function(newText) {
                debouncedSave();
            });
        });
        
        calendarBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            openDatePicker(this, subtaskData.deadline);
        });
        
        deleteBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (confirm('Удалить подзадачу?')) {
                subtask.remove();
                immediateSave();
            }
        });
        
        return subtask;
    } catch (e) {
        console.error('Ошибка создания подзадачи:', e);
        return null;
    }
}

function addSubtaskToTaskElement(taskElement) {
    try {
        const subtasksContainer = taskElement.querySelector('.subtasks');
        if (!subtasksContainer) return;
        if (subtasksContainer.querySelector('.subtask-add-input')) return;
        
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'edit-input subtask-add-input';
        input.placeholder = 'Подзадача...';
        subtasksContainer.appendChild(input);
        input.focus();
        
        const finishEdit = function() {
            const text = input.value.trim();
            input.remove();
            if (text) {
                const subtaskId = generateSubtaskId();
                const subtaskElement = createSubtaskElement({
                    id: subtaskId,
                    text: text,
                    completed: false,
                    deadline: null
                });
                if (subtaskElement) {
                    subtasksContainer.appendChild(subtaskElement);
                    immediateSave();
                }
            }
        };
        
        input.addEventListener('blur', finishEdit);
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') finishEdit();
        });
    } catch (e) {
        console.error('Ошибка добавления подзадачи:', e);
    }
}

function setupTaskDragAndDrop(task) {
    if (!task) return;
    task.addEventListener('dragstart', function(e) {
        try {
            task.classList.add('dragging');
            draggedTaskElement = task;
            e.dataTransfer.setData('text/plain', task.dataset.id);
            e.dataTransfer.effectAllowed = 'move';
        } catch (err) {
            console.error('Ошибка начала перетаскивания:', err);
        }
    });
    task.addEventListener('dragend', function() {
        try {
            this.classList.remove('dragging');
            draggedTaskElement = null;
            if (dropIndicator && dropIndicator.parentNode) {
                dropIndicator.remove();
            }
            dropIndicator = null;
            immediateSave();
        } catch (err) {
            console.error('Ошибка завершения перетаскивания:', err);
        }
    });

    task.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        
        if (draggedTaskElement && draggedTaskElement !== this) {
            try {
                const rect = this.getBoundingClientRect();
                const mid = rect.top + rect.height / 2;
                const mouseY = e.clientY;
                
                if (!dropIndicator) {
                    dropIndicator = document.createElement('div');
                    dropIndicator.className = 'drop-indicator';
                }
                
                if (mouseY < mid) {
                    if (this.previousSibling !== dropIndicator) {
                        this.parentNode.insertBefore(dropIndicator, this);
                    }
                } else {
                    if (this.nextSibling !== dropIndicator) {
                        if (this.nextSibling) {
                            this.parentNode.insertBefore(dropIndicator, this.nextSibling);
                        } else {
                            this.parentNode.appendChild(dropIndicator);
                        }
                    }
                }
            } catch (err) {
                console.error('Ошибка при перетаскивании над задачей:', err);
            }
        }
    });

    task.addEventListener('dragleave', function(e) {
        const relatedTarget = e.relatedTarget;
        if (!this.contains(relatedTarget) && relatedTarget !== this) {
            try {
                if (dropIndicator && dropIndicator.parentNode === this.parentNode) {
                    dropIndicator.remove();
                    dropIndicator = null;
                }
            } catch (err) {
                console.error('Ошибка при выходе из перетаскивания:', err);
            }
        }
    });

    task.addEventListener('drop', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        if (!draggedTaskElement || draggedTaskElement === this) return;
        
        try {
            const rect = this.getBoundingClientRect();
            const mid = rect.top + rect.height / 2;
            const mouseY = e.clientY;
            const tasksContainer = this.parentNode;
            let insertBefore = null;
            
            if (mouseY < mid) {
                insertBefore = this;
            } else {
                insertBefore = this.nextSibling;
            }
            
            if (insertBefore) {
                tasksContainer.insertBefore(draggedTaskElement, insertBefore);
            } else {
                tasksContainer.appendChild(draggedTaskElement);
            }
            
            if (dropIndicator && dropIndicator.parentNode) {
                dropIndicator.remove();
            }
            dropIndicator = null;
        } catch (err) {
            console.error('Ошибка при сбросе задачи:', err);
        }
    });
}

function setupColumnDrop(column) {
    if (!column) return;
    const tasksContainer = column.querySelector('.tasks');
    if (!tasksContainer) return;
    tasksContainer.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        
        if (tasksContainer.children.length === 0 ||
            (tasksContainer.children.length === 1 && 
            tasksContainer.children[0].classList.contains('drop-indicator'))) {
            try {
                if (!dropIndicator) {
                    dropIndicator = document.createElement('div');
                    dropIndicator.className = 'drop-indicator';
                }
                if (!tasksContainer.contains(dropIndicator)) {
                    tasksContainer.appendChild(dropIndicator);
                }
            } catch (err) {
                console.error('Ошибка при перетаскивании над колонкой:', err);
            }
        }
    });

    tasksContainer.addEventListener('dragleave', function(e) {
        const relatedTarget = e.relatedTarget;
        if (!this.contains(relatedTarget) && relatedTarget !== this) {
            try {
                if (dropIndicator && dropIndicator.parentNode === this) {
                    dropIndicator.remove();
                    dropIndicator = null;
                }
            } catch (err) {
                console.error('Ошибка при выходе из перетаскивания колонки:', err);
            }
        }
    });

    tasksContainer.addEventListener('drop', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        if (!draggedTaskElement) return;
        
        try {
            const oldColumn = draggedTaskElement.closest('.column');
            const newColumn = column;
            
            if (oldColumn === newColumn) return;
            
            if (dropIndicator && dropIndicator.parentNode) {
                dropIndicator.remove();
            }
            dropIndicator = null;
            
            tasksContainer.appendChild(draggedTaskElement);
            immediateSave();
        } catch (err) {
            console.error('Ошибка при сбросе в колонку:', err);
        }
    });
}

// ==================== СРОКИ ====================
function setupDeadlinesView() {
    try {
        const deadlinesBtn = document.getElementById('deadlines-btn');
        if (deadlinesBtn) {
            deadlinesBtn.addEventListener('click', function() {
                openDeadlinesView();
            });
        }
    } catch (e) {
        console.error('Ошибка настройки просмотра сроков:', e);
    }
}

function openDeadlinesView() {
    try {
        const boardContainer = document.getElementById('board');
        const boardTitle = document.getElementById('board-title');
        if (!boardContainer || !boardTitle) return;
        boardTitle.textContent = 'Сроки выполнения задач';
        boardContainer.innerHTML = '';
        
        isDeadlinesViewActive = true;
        
        if (currentBoardId) {
            immediateSave();
        }
        
        // ИЗМЕНЕНО: Порядок колонок в разделе "Сроки"
        const columns = [
            { id: 'deadline-overdue', title: 'Просроченные', type: 'overdue', tasks: [] },
            { id: 'deadline-today', title: 'Срок сегодня', type: 'today', tasks: [] },
            { id: 'deadline-future', title: 'Будущие сроки', type: 'future', tasks: [] }
        ];
        
        const allTasks = getAllTasksWithDeadlines();
        
        columns.forEach(column => {
            const columnElement = createDeadlineColumnElement(column);
            if (columnElement) {
                boardContainer.appendChild(columnElement);
                
                const tasksContainer = columnElement.querySelector('.tasks');
                let taskCount = 0;
                
                const filteredTasks = allTasks.filter(task => {
                    if (task.completed) return false;
                    const status = checkDeadlineStatus(task.deadline);
                    return status === column.type;
                });
                
                filteredTasks.sort((a, b) => {
                    const dateA = new Date(a.deadline);
                    const dateB = new Date(b.deadline);
                    return dateA - dateB;
                });
                
                filteredTasks.forEach(task => {
                    const taskElement = createDeadlineTaskElement(task);
                    if (taskElement && tasksContainer) {
                        tasksContainer.appendChild(taskElement);
                        taskCount++;
                    }
                });
                
                const header = columnElement.querySelector('.column-header');
                if (header) {
                    let badge = header.querySelector('.task-count-badge');
                    if (!badge) {
                        badge = document.createElement('span');
                        badge.className = 'task-count-badge';
                        header.appendChild(badge);
                    }
                    badge.textContent = taskCount;
                }
            }
        });
        
        document.querySelectorAll('#boards-list li').forEach(li => li.classList.remove('active'));
        const deadlinesBtn = document.getElementById('deadlines-btn');
        if (deadlinesBtn) {
            deadlinesBtn.classList.add('active');
        }
    } catch (e) {
        console.error('Ошибка открытия просмотра сроков:', e);
    }
}

function createDeadlineColumnElement(columnData) {
    try {
        const column = document.createElement('div');
        column.className = `column deadline-column ${columnData.type}`;
        column.dataset.id = columnData.id;
        column.dataset.type = 'deadline';
        
        const columnHeader = document.createElement('div');
        columnHeader.className = 'column-header';
        
        const titleElement = document.createElement('h2');
        titleElement.className = 'column-title';
        titleElement.textContent = escapeHtml(columnData.title);
        
        const badge = document.createElement('span');
        badge.className = 'task-count-badge';
        badge.textContent = '0';
        
        columnHeader.appendChild(titleElement);
        columnHeader.appendChild(badge);
        
        const tasksContainer = document.createElement('div');
        tasksContainer.className = 'tasks';
        
        column.appendChild(columnHeader);
        column.appendChild(tasksContainer);
        
        return column;
    } catch (e) {
        console.error('Ошибка создания колонки сроков:', e);
        return null;
    }
}

function createDeadlineTaskElement(taskData) {
    try {
        const status = checkDeadlineStatus(taskData.deadline);
        const task = document.createElement('div');
        task.className = 'task deadline-view-task';
        if (status === 'overdue') task.classList.add('deadline-overdue');
        if (status === 'today') task.classList.add('deadline-today');
        if (taskData.completed) task.classList.add('completed');
        
        // СОХРАНЯЕМ ВСЕ НЕОБХОДИМЫЕ ДАННЫЕ
        task.dataset.boardId = taskData.boardId;
        task.dataset.taskId = taskData.id;
        task.dataset.isSubtask = taskData.isSubtask || false;
        task.dataset.columnId = taskData.columnId || '';
        task.dataset.parentTaskId = taskData.parentTaskId || '';
        
        const formattedDate = formatDate(taskData.deadline);
        const isSubtask = taskData.isSubtask || false;
        const taskId = taskData.id;
        
        const taskContent = document.createElement('div');
        taskContent.className = 'task-content';
        
        const mainRow = document.createElement('div');
        mainRow.className = 'task-main-row';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'checkbox';
        if (taskData.completed) checkbox.checked = true;
        
        const textElement = document.createElement('span');
        textElement.className = 'task-text editable';
        textElement.textContent = escapeHtml(taskData.text);
        textElement.dataset.taskId = taskId;
        textElement.dataset.boardId = taskData.boardId;
        textElement.dataset.isSubtask = isSubtask;
        textElement.dataset.columnId = taskData.columnId || '';
        textElement.dataset.parentTaskId = taskData.parentTaskId || '';
        
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'task-actions';
        
        const calendarBtn = document.createElement('button');
        calendarBtn.className = 'task-calendar-btn';
        calendarBtn.title = taskData.deadline ? 'Изменить срок' : 'Установить срок';
        calendarBtn.dataset.taskId = taskId;
        calendarBtn.dataset.boardId = taskData.boardId;
        calendarBtn.dataset.isSubtask = isSubtask;
        calendarBtn.dataset.columnId = taskData.columnId || '';
        calendarBtn.dataset.parentTaskId = taskData.parentTaskId || '';
        
        const calendarIcon = document.createElement('i');
        calendarIcon.className = taskData.deadline ? 'fas fa-calendar-alt' : 'far fa-calendar-alt';
        calendarBtn.appendChild(calendarIcon);
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.title = 'Удалить задачу';
        deleteBtn.dataset.taskId = taskId;
        deleteBtn.dataset.boardId = taskData.boardId;
        deleteBtn.dataset.isSubtask = isSubtask;
        deleteBtn.dataset.columnId = taskData.columnId || '';
        deleteBtn.dataset.parentTaskId = taskData.parentTaskId || '';
        
        const deleteIcon = document.createElement('i');
        deleteIcon.className = 'fas fa-trash';
        deleteBtn.appendChild(deleteIcon);
        
        actionsDiv.appendChild(calendarBtn);
        actionsDiv.appendChild(deleteBtn);
        
        mainRow.appendChild(checkbox);
        mainRow.appendChild(textElement);
        mainRow.appendChild(actionsDiv);
        
        const deadlineRow = document.createElement('div');
        deadlineRow.className = 'deadline-row';
        
        const deadlineIndicator = document.createElement('span');
        deadlineIndicator.className = `deadline-indicator ${status}`;
        
        const calendarIcon2 = document.createElement('i');
        calendarIcon2.className = 'far fa-calendar-alt';
        deadlineIndicator.appendChild(calendarIcon2);
        deadlineIndicator.appendChild(document.createTextNode(` ${escapeHtml(formattedDate)}`));
        
        deadlineRow.appendChild(deadlineIndicator);
        
        const boardInfo = document.createElement('span');
        boardInfo.className = 'board-info';
        
        const boardIcon = document.createElement('i');
        boardIcon.className = 'far fa-clipboard';
        boardInfo.appendChild(boardIcon);
        boardInfo.appendChild(document.createTextNode(` ${escapeHtml(taskData.boardTitle)}`));
        
        deadlineRow.appendChild(boardInfo);
        
        if (isSubtask && taskData.parentTask) {
            const parentInfo = document.createElement('span');
            parentInfo.className = 'board-info';
            
            const parentIcon = document.createElement('i');
            parentIcon.className = 'fas fa-tasks';
            parentInfo.appendChild(parentIcon);
            parentInfo.appendChild(document.createTextNode(` ${escapeHtml(taskData.parentTask)}`));
            
            deadlineRow.appendChild(parentInfo);
        }
        
        taskContent.appendChild(mainRow);
        taskContent.appendChild(deadlineRow);
        task.appendChild(taskContent);
        
        textElement.addEventListener('click', function(e) {
            e.stopPropagation();
            editElement(this, function(newText) {
                updateTaskTextInDeadlinesView(
                    this.dataset.taskId,
                    this.dataset.boardId,
                    this.dataset.isSubtask === 'true',
                    newText
                );
            }.bind(this));
        });
        
        checkbox.addEventListener('change', function() {
            const isCompleted = this.checked;
            task.classList.toggle('completed', isCompleted);
            updateTaskCompletionInDeadlinesView(
                taskId,
                taskData.boardId,
                isSubtask,
                isCompleted
            );
        });
        
        calendarBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            openDatePicker(this, taskData.deadline);
        });
        
        deleteBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (confirm('Удалить задачу?')) {
                deleteTaskInDeadlinesView(
                    taskId,
                    taskData.boardId,
                    isSubtask
                );
                task.remove();
            }
        });
        
        return task;
    } catch (e) {
        console.error('Ошибка создания элемента задачи срока', e);
        return null;
    }
}

function updateTaskTextInDeadlinesView(taskId, boardId, isSubtask, newText) {
    try {
        const boardData = getBoardData(boardId);
        if (!boardData || !boardData.columns) return;
        for (const column of boardData.columns) {
            if (!column.tasks) continue;
            for (const task of column.tasks) {
                if (task.id === taskId && !isSubtask) {
                    task.text = newText;
                    saveBoardData(boardId, boardData);
                    return;
                }
                
                if (task.subtasks && Array.isArray(task.subtasks)) {
                    for (const subtask of task.subtasks) {
                        if (subtask.id === taskId && isSubtask) {
                            subtask.text = newText;
                            saveBoardData(boardId, boardData);
                            return;
                        }
                    }
                }
            }
        }
    } catch (e) {
        console.error('Ошибка обновления текста задачи:', e);
    }
}

function updateTaskCompletionInDeadlinesView(taskId, boardId, isSubtask, isCompleted) {
    try {
        const boardData = getBoardData(boardId);
        if (!boardData || !boardData.columns) return;
        for (const column of boardData.columns) {
            if (!column.tasks) continue;
            for (const task of column.tasks) {
                if (task.id === taskId && !isSubtask) {
                    task.completed = isCompleted;
                    saveBoardData(boardId, boardData);
                    return;
                }
                
                if (task.subtasks && Array.isArray(task.subtasks)) {
                    for (const subtask of task.subtasks) {
                        if (subtask.id === taskId && isSubtask) {
                            subtask.completed = isCompleted;
                            saveBoardData(boardId, boardData);
                            return;
                        }
                    }
                }
            }
        }
    } catch (e) {
        console.error('Ошибка обновления статуса задачи:', e);
    }
}

function deleteTaskInDeadlinesView(taskId, boardId, isSubtask) {
    try {
        const boardData = getBoardData(boardId);
        if (!boardData || !boardData.columns) return;
        for (const column of boardData.columns) {
            if (!column.tasks) continue;
            for (let i = 0; i < column.tasks.length; i++) {
                const task = column.tasks[i];
                
                if (task.id === taskId && !isSubtask) {
                    column.tasks.splice(i, 1);
                    saveBoardData(boardId, boardData);
                    return;
                }
                
                if (task.subtasks && Array.isArray(task.subtasks)) {
                    for (let j = 0; j < task.subtasks.length; j++) {
                        if (task.subtasks[j].id === taskId && isSubtask) {
                            task.subtasks.splice(j, 1);
                            saveBoardData(boardId, boardData);
                            return;
                        }
                    }
                }
            }
        }
    } catch (e) {
        console.error('Ошибка удаления задачи:', e);
    }
}

function getAllTasksWithDeadlines() {
    try {
        const allTasks = [];
        const boards = getAllBoards();
        Object.values(boards).forEach(board => {
            if (board && board.columns && Array.isArray(board.columns)) {
                board.columns.forEach(column => {
                    if (column.tasks && Array.isArray(column.tasks)) {
                        column.tasks.forEach(task => {
                            if (task.deadline) {
                                allTasks.push({
                                    ...task,
                                    boardId: board.id,
                                    boardTitle: board.title,
                                    columnId: column.id,
                                    columnTitle: column.title
                                });
                            }
                            
                            if (task.subtasks && Array.isArray(task.subtasks)) {
                                task.subtasks.forEach(subtask => {
                                    if (subtask.deadline) {
                                        allTasks.push({
                                            ...subtask,
                                            boardId: board.id,
                                            boardTitle: board.title,
                                            columnId: column.id,
                                            columnTitle: column.title,
                                            parentTask: task.text,
                                            parentTaskId: task.id,
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
        console.error('Ошибка получения задач с дедлайнами:', e);
        return [];
    }
}

// ==================== СОБЫТИЯ ====================
function setupEventListeners() {
    try {
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', toggleTheme);
        }
        const addBoardBtn = document.getElementById('add-board-btn');
        if (addBoardBtn) {
            addBoardBtn.addEventListener('click', function() {
                const title = prompt('Название доски:', `Новая доска ${boardIdCounter + 1}`);
                if (title && title.trim()) {
                    if (currentBoardId) immediateSave();
                    createBoard(title.trim());
                }
            });
        }
        
        const addFolderBtn = document.getElementById('add-folder-btn');
        if (addFolderBtn) {
            addFolderBtn.addEventListener('click', function() {
                const folderName = prompt('Название папки:', `Новая папка ${folderIdCounter + 1}`);
                if (folderName && folderName.trim()) {
                    const folderId = createFolder(folderName.trim(), []);
                    if (folderId) {
                        loadBoards();
                    }
                }
            });
        }
        
        const addColumnBtn = document.getElementById('add-column-btn');
        if (addColumnBtn) {
            addColumnBtn.addEventListener('click', function() {
                const title = prompt('Название колонки:', 'Новая колонка');
                if (title && title.trim()) {
                    const columnId = generateColumnId();
                    const columnElement = createColumnElement({
                        id: columnId,
                        title: title.trim(),
                        tasks: []
                    });
                    const board = document.getElementById('board');
                    if (board && columnElement) {
                        board.appendChild(columnElement);
                        
                        const boardData = getBoardData(currentBoardId);
                        if (boardData) {
                            if (!boardData.columns) boardData.columns = [];
                            boardData.columns.push({
                                id: columnId,
                                title: title.trim(),
                                tasks: []
                            });
                            saveBoardData(currentBoardId, boardData);
                        }
                    }
                }
            });
        }
        
        const boardTitleElement = document.getElementById('board-title');
        if (boardTitleElement) {
            boardTitleElement.addEventListener('click', function(e) {
                e.stopPropagation();
                editElement(this, function(newText) {
                    const boardData = getBoardData(currentBoardId);
                    if (boardData) {
                        boardData.title = newText;
                        saveBoardData(currentBoardId, boardData);
                        
                        document.querySelectorAll(`#boards-list li[data-id="${currentBoardId}"] .board-name`)
                            .forEach(item => {
                                if (item) item.textContent = escapeHtml(newText);
                            });
                        
                        document.querySelectorAll(`.folder-boards li[data-id="${currentBoardId}"] .board-name`)
                            .forEach(item => {
                                if (item) item.textContent = `→ ${escapeHtml(newText)}`;
                            });
                    }
                });
            });
        }
        
        const boardList = document.getElementById('boards-list');
        if (boardList) {
            boardList.addEventListener('dragover', function(e) {
                e.preventDefault();
                const data = e.dataTransfer.getData('text/plain');
                
                if (data.startsWith('board-inside-folder:')) {
                    e.dataTransfer.dropEffect = 'move';
                }
            });
            
            boardList.addEventListener('drop', function(e) {
                e.preventDefault();
                const data = e.dataTransfer.getData('text/plain');
                
                if (data.startsWith('board-inside-folder:')) {
                    const parts = data.split(':');
                    const boardId = parts[1];
                    const folderId = parts[2];
                    
                    if (removeBoardFromFolder(boardId, folderId)) {
                        const boardData = getBoardData(boardId);
                        if (boardData) {
                            createBoardListItem(boardId, boardData.title);
                        }
                        
                        const folderElement = document.querySelector(`#boards-list li[data-id="${folderId}"]`);
                        if (folderElement) {
                            const folderContent = folderElement.querySelector('.folder-boards');
                            const nestedLi = folderContent ? folderContent.querySelector(`li[data-id="${boardId}"]`) : null;
                            if (nestedLi) {
                                nestedLi.remove();
                            }
                        }
                    }
                }
            });
        }
        
        // Переключение компактного режима по Ctrl+Shift+C
        document.addEventListener('keydown', function(e) {
            if (e.ctrlKey && e.shiftKey && e.key === 'C') {
                if (checkCompactMode()) {
                    disableCompactMode();
                    showNotification('Компактный режим отключен', 'info');
                } else {
                    enableCompactMode();
                    showNotification('Компактный режим включен', 'info');
                }
            }
        });
    } catch (e) {
        console.error('Ошибка настройки обработчиков событий:', e);
    }
}

function checkAllDeadlines() {
    try {
        const boards = getAllBoards();
        Object.keys(boards).forEach(boardId => {
            const board = boards[boardId];
            let needsUpdate = false;
            if (board.columns) {
                board.columns.forEach(column => {
                    if (column.tasks) {
                        column.tasks.forEach(task => {
                            if (task.deadline) {
                                const status = checkDeadlineStatus(task.deadline);
                                const taskElement = document.querySelector(`[data-id="${task.id}"]`);
                                if (taskElement) {
                                    if (status === 'overdue' && !taskElement.classList.contains('deadline-overdue')) {
                                        needsUpdate = true;
                                    } else if (status === 'today' && !taskElement.classList.contains('deadline-today')) {
                                        needsUpdate = true;
                                    }
                                }
                            }
                        });
                    }
                });
            }
            
            if (needsUpdate && currentBoardId === boardId) {
                openBoard(boardId);
            }
        });
    } catch (e) {
        console.error('Ошибка проверки дедлайнов:', e);
    }
}

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
function initializeApp() {
    console.log('Инициализация Kanban Board...');
    try {
        boardContainer = document.getElementById('board');
        boardList = document.getElementById('boards-list');
        boardTitleElement = document.getElementById('board-title');
        if (!boardContainer || !boardList || !boardTitleElement) {
            throw new Error('Не удалось найти необходимые DOM элементы');
        }
        
        initializeCounters();
        loadTheme();
        setupDatePicker();
        setupDeadlinesView();
        setupExportImport();
        setupEventListeners();
        loadBoards();
        
        deadlineCheckInterval = setInterval(checkAllDeadlines, 5 * 60 * 1000);
        
        if (checkCompactMode()) {
            setTimeout(() => {
                enableCompactMode();
            }, 500);
        }
        
        console.log('Kanban Board успешно инициализирован');
    } catch (error) {
        console.error('Ошибка инициализации:', error);
        showNotification('Произошла ошибка при загрузке приложения. Пожалуйста, обновите страницу.', 'error');
    }
}

// Запуск приложения
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}