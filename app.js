(function(global) {
  'use strict';

  // ─── Helper: Generate UUID v4 ─────────────────────────────────────────────
  function generateUUID() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    // Manual fallback
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0;
      var v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // ─── Helper: Get ISO Week Key ─────────────────────────────────────────────
  function getWeekKey(date) {
    var d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    var dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    var weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return d.getUTCFullYear() + '-W' + String(weekNo).padStart(2, '0');
  }

  // ─── Helper: Add Days to a Date ───────────────────────────────────────────
  function addDays(date, days) {
    var result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  // ─── Helper: Format Deadline ──────────────────────────────────────────────
  var hebrewMonths = [
    'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
    'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
  ];
  var hebrewOrdinals = [
    '', 'א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ז׳', 'ח׳', 'ט׳',
    'י׳', 'י״א', 'י״ב', 'י״ג', 'י״ד', 'ט״ו', 'ט״ז', 'י״ז', 'י״ח', 'י״ט',
    'כ׳', 'כ״א', 'כ״ב', 'כ״ג', 'כ״ד', 'כ״ה', 'כ״ו', 'כ״ז', 'כ״ח', 'כ״ט',
    'ל׳', 'ל״א'
  ];

  function formatDeadline(deadlineDate, deadlineTime) {
    if (!deadlineDate) return '';
    try {
      var parts = deadlineDate.split('-');
      var year = parseInt(parts[0], 10);
      var month = parseInt(parts[1], 10) - 1;
      var day = parseInt(parts[2], 10);
      var ordinal = hebrewOrdinals[day] || String(day);
      var monthName = hebrewMonths[month] || '';
      var timeStr = deadlineTime ? ', ' + deadlineTime : '';
      return ordinal + ' ב' + monthName + ' ' + year + timeStr;
    } catch (e) {
      return deadlineDate + (deadlineTime ? ' ' + deadlineTime : '');
    }
  }

  // ─── Helper: Format Relative Time ────────────────────────────────────────
  function formatRelativeTime(deadlineTs) {
    if (!deadlineTs) return '';
    var now = Date.now();
    var diff = deadlineTs - now;

    if (diff < 0) {
      return 'פג תוקף';
    }

    var hours = diff / 3600000;
    var days = Math.floor(diff / 86400000);

    if (hours < 24) {
      return 'דחוף! פחות מ-24 שעות';
    } else if (days === 1) {
      return 'בעוד יום אחד';
    } else if (days < 7) {
      return 'בעוד ' + days + ' ימים';
    } else if (days < 14) {
      return 'בעוד שבוע';
    } else {
      var weeks = Math.floor(days / 7);
      return 'בעוד ' + weeks + ' שבועות';
    }
  }

  // ─── WeekProgress helpers ─────────────────────────────────────────────────
  function readWeekProgress() {
    try {
      var raw = localStorage.getItem('seder_week_progress');
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.error('WeekProgress read error:', e);
      return null;
    }
  }

  function saveWeekProgress(progress) {
    try {
      localStorage.setItem('seder_week_progress', JSON.stringify(progress));
    } catch (e) {
      console.error('WeekProgress save error:', e);
    }
  }

  function initWeekProgress() {
    var currentWeek = getWeekKey(new Date());
    var progress = readWeekProgress();
    if (!progress || progress.weekKey !== currentWeek) {
      progress = { weekKey: currentWeek, completed: 0, total: 0 };
      saveWeekProgress(progress);
    }
  }

  // ─── TaskStore ────────────────────────────────────────────────────────────
  var TaskStore = {
    getAll: function() {
      try {
        var raw = localStorage.getItem('seder_tasks');
        if (!raw) return [];
        var parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        console.error('TaskStore.getAll error:', e);
        return [];
      }
    },

    _save: function(tasks) {
      try {
        localStorage.setItem('seder_tasks', JSON.stringify(tasks));
      } catch (e) {
        console.error('TaskStore._save error:', e);
      }
    },

    getById: function(id) {
      try {
        var tasks = this.getAll();
        return tasks.find(function(t) { return t.id === id; }) || null;
      } catch (e) {
        console.error('TaskStore.getById error:', e);
        return null;
      }
    },

    add: function(taskData) {
      try {
        var tasks = this.getAll();
        var now = new Date();
        var deadlineTs = new Date(
          (taskData.deadlineDate || '') + 'T' + (taskData.deadlineTime || '00:00')
        ).getTime();

        var newTask = Object.assign({}, taskData, {
          id: generateUUID(),
          deadlineTs: deadlineTs,
          weekKey: getWeekKey(now),
          createdAt: Date.now()
        });

        tasks.push(newTask);
        this._save(tasks);

        // Update WeekProgress total
        var progress = readWeekProgress();
        if (!progress || progress.weekKey !== getWeekKey(now)) {
          progress = { weekKey: getWeekKey(now), completed: 0, total: 0 };
        }
        progress.total += 1;
        saveWeekProgress(progress);

        return newTask;
      } catch (e) {
        console.error('TaskStore.add error:', e);
        return null;
      }
    },

    update: function(id, data) {
      try {
        var tasks = this.getAll();
        var index = tasks.findIndex(function(t) { return t.id === id; });
        if (index === -1) return null;

        var updated = Object.assign({}, tasks[index], data);
        // Recompute deadlineTs and weekKey
        updated.deadlineTs = new Date(
          (updated.deadlineDate || '') + 'T' + (updated.deadlineTime || '00:00')
        ).getTime();
        updated.weekKey = getWeekKey(new Date(updated.deadlineDate || Date.now()));

        tasks[index] = updated;
        this._save(tasks);
        return updated;
      } catch (e) {
        console.error('TaskStore.update error:', e);
        return null;
      }
    },

    delete: function(id) {
      try {
        var tasks = this.getAll();
        var filtered = tasks.filter(function(t) { return t.id !== id; });
        if (filtered.length === tasks.length) return false;
        this._save(filtered);
        return true;
      } catch (e) {
        console.error('TaskStore.delete error:', e);
        return false;
      }
    },

    complete: function(id) {
      try {
        var tasks = this.getAll();
        var taskIndex = tasks.findIndex(function(t) { return t.id === id; });
        if (taskIndex === -1) return false;

        var task = tasks[taskIndex];

        // Remove from active tasks
        tasks.splice(taskIndex, 1);
        this._save(tasks);

        // Add to archive with completedAt
        var archive = this.getArchive();
        var archivedTask = Object.assign({}, task, { completedAt: Date.now() });
        archive.push(archivedTask);
        try {
          localStorage.setItem('seder_archive', JSON.stringify(archive));
        } catch (e) {
          console.error('TaskStore.complete archive save error:', e);
        }

        // Increment WeekProgress completed
        var progress = readWeekProgress();
        if (!progress || progress.weekKey !== getWeekKey(new Date())) {
          progress = { weekKey: getWeekKey(new Date()), completed: 0, total: 0 };
        }
        progress.completed += 1;
        saveWeekProgress(progress);

        return true;
      } catch (e) {
        console.error('TaskStore.complete error:', e);
        return false;
      }
    },

    getArchive: function() {
      try {
        var raw = localStorage.getItem('seder_archive');
        if (!raw) return [];
        var parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        console.error('TaskStore.getArchive error:', e);
        return [];
      }
    },

    getUpcoming: function(days) {
      try {
        var now = Date.now();
        var limit = now + days * 86400000;
        var tasks = this.getAll();
        return tasks
          .filter(function(t) {
            return t.deadlineTs >= now && t.deadlineTs <= limit;
          })
          .sort(function(a, b) {
            return a.deadlineTs - b.deadlineTs;
          });
      } catch (e) {
        console.error('TaskStore.getUpcoming error:', e);
        return [];
      }
    },

    getWeekTasks: function(weekOffset) {
      try {
        var targetWeekKey = getWeekKey(addDays(new Date(), (weekOffset || 0) * 7));
        return this.getAll().filter(function(t) {
          return t.weekKey === targetWeekKey;
        });
      } catch (e) {
        console.error('TaskStore.getWeekTasks error:', e);
        return [];
      }
    }
  };

  // ─── ValidationEngine ─────────────────────────────────────────────────────
  var VALID_COURSES = ['web', 'ds', 'algo', 'os', 'project', 'other'];

  var ValidationEngine = {
    validateTaskForm: function(formData) {
      var errors = {};
      var valid = true;

      // Validate title
      if (!formData.title || typeof formData.title !== 'string' || formData.title.trim() === '') {
        errors.title = 'נא להזין כותרת למשימה';
        valid = false;
      }

      // Validate deadlineDate
      if (!formData.deadlineDate || formData.deadlineDate === '') {
        errors.deadlineDate = 'נא לבחור תאריך הגשה';
        valid = false;
      }

      // Validate course
      if (!formData.course || VALID_COURSES.indexOf(formData.course) === -1) {
        errors.course = 'נא לבחור קורס';
        valid = false;
      }

      return { valid: valid, errors: errors };
    }
  };

  // ─── AIPlanner ────────────────────────────────────────────────────────────
  var AIPlanner = {
    generateSchedule: function(tasks, preferences) {
      var prefs = preferences || {};
      var availableDays = Array.isArray(prefs.availableDays)
        ? prefs.availableDays
        : [0, 1, 2, 3, 4]; // Sun-Thu default

      var computePromise = new Promise(function(resolve) {
        // Sort tasks by deadlineTs ascending
        var sorted = (tasks || []).slice().sort(function(a, b) {
          return (a.deadlineTs || 0) - (b.deadlineTs || 0);
        });

        // Build days object
        var days = {};
        availableDays.forEach(function(d) {
          days[d] = [];
        });

        // For each task, find the closest available day before its deadline
        // If no day before deadline, use the last available day
        var today = new Date();
        today.setHours(0, 0, 0, 0);

        sorted.forEach(function(task) {
          var deadlineDate = task.deadlineTs ? new Date(task.deadlineTs) : null;
          var assignedDay = null;

          if (deadlineDate) {
            // Try to find closest available day at or before deadline
            // Look at current week days (0-6 as day-of-week)
            var deadlineDayOfWeek = deadlineDate.getDay();

            // Find available days that are <= deadline day of week
            var daysBeforeDeadline = availableDays.filter(function(d) {
              return d <= deadlineDayOfWeek;
            });

            if (daysBeforeDeadline.length > 0) {
              // Pick the closest one (largest day number <= deadlineDayOfWeek)
              assignedDay = daysBeforeDeadline.reduce(function(closest, d) {
                return Math.abs(d - deadlineDayOfWeek) < Math.abs(closest - deadlineDayOfWeek) ? d : closest;
              });
            }
          }

          // If no day found before deadline, use the last available day
          if (assignedDay === null) {
            assignedDay = availableDays[availableDays.length - 1];
          }

          // Ensure the day slot exists
          if (!days[assignedDay]) {
            days[assignedDay] = [];
          }
          days[assignedDay].push(task.id);
        });

        var schedule = {
          weekKey: getWeekKey(new Date()),
          approved: false,
          days: days
        };

        resolve(schedule);
      });

      var timeoutPromise = new Promise(function(_, reject) {
        setTimeout(function() {
          reject(new Error('תם הזמן – נסי שנית'));
        }, 10000);
      });

      return Promise.race([computePromise, timeoutPromise]);
    }
  };

  // ─── Dark Mode Helpers ────────────────────────────────────────────────────
  function applyTheme() {
    try {
      var isDark = localStorage.getItem('seder_darkmode') === '1';
      document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');

      var toggle = document.getElementById('dark-toggle');
      if (toggle) {
        toggle.textContent = isDark ? '☀️' : '🌙';
        toggle.setAttribute('aria-label', isDark ? 'עבור למצב בהיר' : 'עבור למצב כהה');
      }
    } catch (e) {
      console.error('applyTheme error:', e);
    }
  }

  function toggleTheme() {
    try {
      var current = localStorage.getItem('seder_darkmode');
      var newValue = current === '1' ? '0' : '1';
      localStorage.setItem('seder_darkmode', newValue);
      applyTheme();
    } catch (e) {
      console.error('toggleTheme error:', e);
    }
  }

  // ─── Sample Data Seeder ───────────────────────────────────────────────────
  function seedSampleTasks() {
    try {
      var existing = TaskStore.getAll();
      if (existing.length > 0) return;

      var today = new Date();

      function dateStr(offsetDays) {
        var d = addDays(today, offsetDays);
        var year = d.getFullYear();
        var month = String(d.getMonth() + 1).padStart(2, '0');
        var day = String(d.getDate()).padStart(2, '0');
        return year + '-' + month + '-' + day;
      }

      TaskStore.add({
        title: 'מטלת תכנות ב-C# בנושא מטריצות',
        course: 'algo',
        description: 'יישום כפל מטריצות עם מורכבות O(n²)',
        priority: 'high',
        deadlineDate: dateStr(3),
        deadlineTime: '23:59'
      });

      TaskStore.add({
        title: 'קריאת פסיקה בדיני נזיקין',
        course: 'other',
        description: 'קריאת פסק דין בית המשפט העליון בנושא עוולת הרשלנות',
        priority: 'normal',
        deadlineDate: dateStr(1),
        deadlineTime: '12:00'
      });

      TaskStore.add({
        title: 'הגשת תרגיל בתכנות מערכות',
        course: 'os',
        description: 'מימוש shell פשוט ב-C עם תמיכה בפייפים',
        priority: 'high',
        deadlineDate: dateStr(5),
        deadlineTime: '23:59'
      });
    } catch (e) {
      console.error('seedSampleTasks error:', e);
    }
  }

  // ─── Expose to global ─────────────────────────────────────────────────────
  global.TaskStore = TaskStore;
  global.ValidationEngine = ValidationEngine;
  global.AIPlanner = AIPlanner;
  global.getWeekKey = getWeekKey;
  global.applyTheme = applyTheme;
  global.toggleTheme = toggleTheme;
  global.seedSampleTasks = seedSampleTasks;
  global.initWeekProgress = initWeekProgress;
  global.formatDeadline = formatDeadline;
  global.formatRelativeTime = formatRelativeTime;

})(typeof globalThis !== 'undefined' ? globalThis : window);
