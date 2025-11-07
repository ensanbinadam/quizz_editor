
(function() {
  'use strict';

  // === State Management ===
  const state = {
    questions: [],
    currentQuestion: 0, // Index of the question being edited
  };

  const STORAGE_KEY = "quiz_editor_advanced_ar_v1";

  // === Utility Functions ===
  function sanitizeHTML(html) {
    if (!window.DOMPurify) return html || '';
    return DOMPurify.sanitize(html || '', {
      ADD_TAGS: ['a', 'u', 'mark', 'blockquote', 'hr', 'pre', 'code', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'img', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'p', 'span', 'div', 'br', 'sub', 'sup', 'strong', 'em', 'audio', 'source'],
      ALLOWED_ATTR: ['src', 'alt', 'style', 'class', 'rowspan', 'colspan', 'href', 'target', 'rel', 'dir', 'width', 'height', 'controls', 'preload', 'type'],
    });
  }
  
  function stripHtml(html) {
    let doc = new DOMParser().parseFromString(html, 'text/html');
    return doc.body.textContent || "";
  }

  function ensureQuestionSanity(q) {
    q.type = q.type || 'multiple-choice';
    q.reading = q.reading || { text: '', image: null, audio: null };
    q.question = q.question || { text: '', image: null };

    if (q.type === 'multiple-choice') {
      q.options = q.options || [];
      for (let i = 0; i < 4; i++) {
        if (!q.options[i]) q.options[i] = { text: '', image: null };
      }
      q.correct = (typeof q.correct === 'number' && q.correct >= 0 && q.correct < 4) ? q.correct : 0;
    } else if (q.type === 'fill-in-the-blank' || q.type === 'short-answer') {
      q.correctAnswer = q.correctAnswer || '';
    } else if (q.type === 'true-false') {
      q.correctAnswer = typeof q.correctAnswer === 'boolean' ? q.correctAnswer : true;
    } else if (q.type === 'matching') {
      q.prompts = q.prompts || [];
      q.answers = q.answers || [];
    } else if (q.type === 'ordering') {
      q.items = q.items || [];
    }
    // Clean up properties from other types
    const validProps = ['type', 'reading', 'question'];
    if (q.type === 'multiple-choice') validProps.push('options', 'correct');
    if (q.type === 'fill-in-the-blank' || q.type === 'short-answer' || q.type === 'true-false') validProps.push('correctAnswer');
    if (q.type === 'matching') validProps.push('prompts', 'answers');
    if (q.type === 'ordering') validProps.push('items');
    Object.keys(q).forEach(key => {
        if (!validProps.includes(key)) delete q[key];
    });
  }

  function getCurrentQuestionOrCreate() {
    if (!Array.isArray(state.questions) || state.questions.length === 0) {
      addNewQuestion(0, false); // Add first question without rendering list
    }
    const q = state.questions[state.currentQuestion];
    ensureQuestionSanity(q);
    return q;
  }
  
  // === Question List UI ===
  let draggedItem = null;

  function renderQuestionList() {
    const listEl = document.getElementById('questionList');
    if (!listEl) return;
    listEl.innerHTML = '';
    
    document.getElementById('questionCount').textContent = state.questions.length;

    state.questions.forEach((q, index) => {
      const li = document.createElement('li');
      li.dataset.index = index;
      li.draggable = true;
      if (index === state.currentQuestion) {
        li.classList.add('active');
      }

      const previewText = stripHtml(q.question?.text || 'سؤال فارغ').substring(0, 50) + '...';

      li.innerHTML = `
        <div class="question-list-item-header">
          <span class="drag-handle">☰</span>
          <span>السؤال ${index + 1} (${q.type})</span>
        </div>
        <div class="question-list-item-preview">${previewText}</div>
        <div class="question-list-item-controls">
          <button class="edit-btn" title="تعديل هذا السؤال">✏️ تعديل</button>
          <button class="duplicate-btn" title="نسخ هذا السؤال">📋 نسخ</button>
          <button class="insert-btn" title="إدراج سؤال جديد بعد هذا">➕ إدراج</button>
          <button class="delete-btn" title="حذف هذا السؤال">🗑️ حذف</button>
        </div>
      `;
      
      li.addEventListener('click', () => editQuestion(index));

      // Drag and Drop events
      li.addEventListener('dragstart', (e) => {
        draggedItem = e.target.closest('li');
        setTimeout(() => {
            draggedItem.style.display = 'none';
        }, 0);
      });
      li.addEventListener('dragend', (e) => {
        setTimeout(() => {
            if (draggedItem) {
                draggedItem.style.display = '';
                draggedItem = null;
            }
            document.querySelectorAll('#questionList li.ghost').forEach(g => g.remove());
        }, 0);
      });
      li.addEventListener('dragover', (e) => {
        e.preventDefault();
        const rect = li.getBoundingClientRect();
        const offset = e.clientY - rect.top - rect.height / 2;
        document.querySelectorAll('#questionList li.ghost').forEach(g => g.remove());
        const ghost = document.createElement('li');
        ghost.className = 'ghost';
        ghost.style.height = li.offsetHeight + 'px';
        if (offset > 0) {
            li.after(ghost);
        } else {
            li.before(ghost);
        }
      });
      li.addEventListener('drop', (e) => {
        e.preventDefault();
        const fromIndex = parseInt(draggedItem.dataset.index, 10);
        let toIndex = parseInt(li.dataset.index, 10);
        
        const rect = li.getBoundingClientRect();
        const offset = e.clientY - rect.top - rect.height / 2;
        if (offset > 0) toIndex++;
        
        if (fromIndex !== toIndex) {
            const [movedQuestion] = state.questions.splice(fromIndex, 1);
            state.questions.splice(toIndex > fromIndex ? toIndex - 1 : toIndex, 0, movedQuestion);
            
            // Adjust currentQuestion index
            if (state.currentQuestion === fromIndex) {
                state.currentQuestion = toIndex > fromIndex ? toIndex - 1 : toIndex;
            } else if (fromIndex < state.currentQuestion && toIndex > state.currentQuestion) {
                state.currentQuestion--;
            } else if (fromIndex > state.currentQuestion && toIndex <= state.currentQuestion) {
                state.currentQuestion++;
            }
            
            persist();
            renderQuestionList();
        }
      });

      listEl.appendChild(li);
    });
    
    // Attach event listeners for controls
    listEl.querySelectorAll('.edit-btn').forEach((btn, index) => btn.onclick = (e) => { e.stopPropagation(); editQuestion(index); });
    listEl.querySelectorAll('.duplicate-btn').forEach((btn, index) => btn.onclick = (e) => { e.stopPropagation(); duplicateQuestion(index); });
    listEl.querySelectorAll('.insert-btn').forEach((btn, index) => btn.onclick = (e) => { e.stopPropagation(); addNewQuestion(index + 1); });
    listEl.querySelectorAll('.delete-btn').forEach((btn, index) => btn.onclick = (e) => { e.stopPropagation(); deleteQuestion(index); });
  }

  // === Editor Logic ===
  function populateEditForm() {
    const q = getCurrentQuestionOrCreate();
    if (!q) return;

    document.getElementById('editingQuestionNumber').textContent = `(رقم ${state.currentQuestion + 1})`;
    document.getElementById('editQuestionType').value = q.type || 'multiple-choice';

    // Hide all editors, then show the correct one
    ['multipleChoiceEditor', 'fillInTheBlankEditor', 'trueFalseEditor', 'shortAnswerEditor', 'matchingEditor', 'orderingEditor']
        .forEach(id => document.getElementById(id).style.display = 'none');
    
    if (q.type === 'fill-in-the-blank') {
        document.getElementById('fillInTheBlankEditor').style.display = 'block';
        document.getElementById('editCorrectAnswer').value = q.correctAnswer || '';
    } else if (q.type === 'true-false') {
        document.getElementById('trueFalseEditor').style.display = 'block';
        document.querySelectorAll('input[name="correctTFAnswer"]').forEach(radio => {
            radio.checked = radio.value === String(q.correctAnswer);
        });
    } else if (q.type === 'short-answer') {
        document.getElementById('shortAnswerEditor').style.display = 'block';
        document.getElementById('editShortAnswer').value = q.correctAnswer || '';
    } else if (q.type === 'matching') {
        document.getElementById('matchingEditor').style.display = 'block';
        for (let i = 0; i < 4; i++) {
            document.getElementById(`editMatchPrompt${i + 1}`).value = q.prompts[i] || '';
            document.getElementById(`editMatchAnswer${i + 1}`).value = q.answers[i] || '';
        }
    } else if (q.type === 'ordering') {
        document.getElementById('orderingEditor').style.display = 'block';
        for (let i = 0; i < 5; i++) {
            document.getElementById(`editOrderItem${i + 1}`).value = q.items[i] || '';
        }
    } else { // multiple-choice
        document.getElementById('multipleChoiceEditor').style.display = 'block';
        for (let i = 0; i < 4; i++) {
            const opt = q.options?.[i] || { text: '', image: null };
            document.getElementById('editOption' + (i + 1)).value = opt.text || '';
            const p = document.getElementById('optionImagePreview' + (i + 1));
            p.src = opt.image || '';
            p.style.display = opt.image ? 'block' : 'none';
            document.getElementById('correct' + (i + 1)).checked = i === (q.correct || 0);
            document.getElementById('editOptionImage' + (i + 1)).value = '';
        }
    }

    // Populate common fields
    document.getElementById('editReadingText').value = q.reading?.text || '';
    const rPrev = document.getElementById('readingImagePreview');
    rPrev.src = q.reading?.image || '';
    rPrev.style.display = q.reading?.image ? 'block' : 'none';
    document.getElementById('editReadingImage').value = '';

    const aPrev = document.getElementById('readingAudioPreview');
    aPrev.src = q.reading?.audio || '';
    aPrev.style.display = q.reading?.audio ? 'block' : 'none';
    if(aPrev.style.display === 'block') aPrev.load();
    document.getElementById('editReadingAudio').value = '';

    document.getElementById('editQuestionText').value = q.question?.text || '';
    const qPrev = document.getElementById('questionImagePreview');
    qPrev.src = q.question?.image || '';
    qPrev.style.display = q.question?.image ? 'block' : 'none';
    document.getElementById('editQuestionImage').value = '';
    
    renderQuestionList();
  }

  function saveEdit(andAddNew = false) {
    const q = state.questions[state.currentQuestion];
    if (!q) return;

    const questionType = document.getElementById('editQuestionType').value;
    if (q.type !== questionType) {
        q.type = questionType;
        ensureQuestionSanity(q);
    }

    q.reading.text = document.getElementById('editReadingText').value.trim();
    q.question.text = document.getElementById('editQuestionText').value.trim();

    // Save type-specific fields
    if (q.type === 'multiple-choice') {
        for (let i = 0; i < 4; i++) {
            q.options[i].text = document.getElementById(`editOption${i + 1}`).value.trim();
        }
        const correctRadio = document.querySelector('input[name="correctOption"]:checked');
        q.correct = correctRadio ? parseInt(correctRadio.value, 10) : 0;
    } else if (q.type === 'fill-in-the-blank') {
        q.correctAnswer = document.getElementById('editCorrectAnswer').value.trim();
    } else if (q.type === 'true-false') {
        const correctRadio = document.querySelector('input[name="correctTFAnswer"]:checked');
        q.correctAnswer = correctRadio ? correctRadio.value === 'true' : true;
    } else if (q.type === 'short-answer') {
        q.correctAnswer = document.getElementById('editShortAnswer').value.trim();
    } else if (q.type === 'matching') {
        q.prompts = [];
        q.answers = [];
        for (let i = 1; i <= 4; i++) {
            const promptText = document.getElementById(`editMatchPrompt${i}`).value.trim();
            const answerText = document.getElementById(`editMatchAnswer${i}`).value.trim();
            if (promptText && answerText) {
                q.prompts.push(promptText);
                q.answers.push(answerText);
            }
        }
    } else if (q.type === 'ordering') {
        q.items = [];
        for (let i = 1; i <= 5; i++) {
            const itemText = document.getElementById(`editOrderItem${i}`).value.trim();
            if (itemText) {
                q.items.push(itemText);
            }
        }
    }

    persist();
    renderQuestionList();

    if (andAddNew) {
        addNewQuestion(state.currentQuestion + 1);
    }
  }

  function editQuestion(index) {
    if (index < 0 || index >= state.questions.length) return;
    state.currentQuestion = index;
    populateEditForm();
  }

  function addNewQuestion(index = -1, render = true) { // -1 means at the end
    const newQ = { type: 'multiple-choice' };
    ensureQuestionSanity(newQ);
    
    if(index === -1 || index > state.questions.length) {
        state.questions.push(newQ);
        state.currentQuestion = state.questions.length - 1;
    } else {
        state.questions.splice(index, 0, newQ);
        state.currentQuestion = index;
    }

    if (render) {
      populateEditForm();
    }
  }

  function duplicateQuestion(index) {
    const src = state.questions[index];
    if (!src) return;
    const clone = JSON.parse(JSON.stringify(src));
    state.questions.splice(index + 1, 0, clone);
    state.currentQuestion = index + 1;
    populateEditForm();
  }

  function deleteQuestion(index) {
    if (state.questions.length <= 1) {
      alert('لا يمكن حذف السؤال الوحيد! يمكنك تعديله بدلاً من ذلك.');
      return;
    }
    if (!confirm(`هل أنت متأكد من حذف السؤال رقم ${index + 1}؟`)) return;

    state.questions.splice(index, 1);
    if (state.currentQuestion >= index) {
      state.currentQuestion = Math.max(0, state.currentQuestion - 1);
    }
    
    populateEditForm();
  }
  
  function resetQuestions() {
    if (!confirm('سيتم مسح جميع الأسئلة الحالية. هل تريد المتابعة؟')) return;
    localStorage.removeItem(STORAGE_KEY);
    state.questions = [];
    state.currentQuestion = 0;
    init();
  }

  // === Media Handling ===
  function handleBinaryUpload(input, previewId, setter, isAudio = false) {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target.result;
      const prevEl = document.getElementById(previewId);
      if (prevEl) {
        prevEl.src = data;
        prevEl.style.display = 'block';
        if (isAudio) prevEl.load?.();
      }
      setter(data);
    };
    reader.readAsDataURL(file);
  }

  async function pasteImageFromClipboard(previewId, setter) {
    try {
      if (!navigator.clipboard?.read) {
        alert('متصفحك لا يدعم لصق الصور مباشرة.');
        return;
      }
      const items = await navigator.clipboard.read();
      const imageItem = items.find(item => item.types.some(t => t.startsWith('image/')));
      if (imageItem) {
        const type = imageItem.types.find(t => t.startsWith('image/'));
        const blob = await imageItem.getType(type);
        const reader = new FileReader();
        reader.onload = (e) => {
          const base64 = e.target.result;
          document.getElementById(previewId).src = base64;
          document.getElementById(previewId).style.display = 'block';
          setter(base64);
        };
        reader.readAsDataURL(blob);
      } else {
        alert('لا توجد صورة في الحافظة.');
      }
    } catch (err) {
      console.error('Paste error:', err);
      alert('فشل لصق الصورة. قد تحتاج إلى منح الإذن بالوصول إلى الحافظة.');
    }
  }

  function clearMedia(previewId, inputId, setter, isAudio = false) {
    const prev = document.getElementById(previewId);
    if (prev) {
      prev.removeAttribute('src');
      prev.style.display = 'none';
      if (isAudio) prev.load?.();
    }
    if (inputId) {
      const inp = document.getElementById(inputId);
      if (inp) inp.value = '';
    }
    setter(null);
  }
  
  // === Persistence & File I/O ===
  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.error('Failed to save state:', err);
    }
  }

  function restore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (Array.isArray(p.questions)) state.questions = p.questions;
        state.currentQuestion = p.currentQuestion || 0;
        if (state.currentQuestion >= state.questions.length) state.currentQuestion = 0;
      }
    } catch (err) {
      console.error('Failed to restore state:', err);
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  function importQuestions() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const data = JSON.parse(evt.target.result);
          if (!Array.isArray(data)) throw new Error('Invalid format');
          state.questions = data.map(q => { ensureQuestionSanity(q); return q; });
          state.currentQuestion = 0;
          init();
        } catch (err) {
          alert('تعذر قراءة ملف الأسئلة. تأكد من صحة الصيغة.');
          console.error(err);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }
  
  function exportQuestions() {
    if (state.questions.length === 0) {
      alert('لا توجد أسئلة لتصديرها!');
      return;
    }
    const dataStr = JSON.stringify(state.questions, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'quiz_questions.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  // === Event Listeners Setup ===
  function attachEventListeners() {
    // Main Toolbar
    document.getElementById('importButton').onclick = importQuestions;
    document.getElementById('exportButton').onclick = exportQuestions;
    document.getElementById('addNewEndButton').onclick = () => addNewQuestion(-1);
    document.getElementById('resetQuestionsBtn').onclick = resetQuestions;

    // Editor Panel
    document.getElementById('saveEditBtn').onclick = () => saveEdit(false);
    document.getElementById('saveAndNewBtn').onclick = () => saveEdit(true);
    document.getElementById('editQuestionType').onchange = (e) => {
      const q = getCurrentQuestionOrCreate();
      q.type = e.target.value;
      ensureQuestionSanity(q);
      populateEditForm();
    };

    // Media Handlers
    const q = () => state.questions[state.currentQuestion];
    document.getElementById('editReadingImage').onchange = function() { handleBinaryUpload(this, 'readingImagePreview', (d) => q().reading.image = d); };
    document.getElementById('readingImagePasteBtn').onclick = () => { pasteImageFromClipboard('readingImagePreview', (d) => q().reading.image = d); };
    document.getElementById('readingImageClearBtn').onclick = () => { clearMedia('readingImagePreview', 'editReadingImage', () => q().reading.image = null); };
    
    document.getElementById('editReadingAudio').onchange = function() { handleBinaryUpload(this, 'readingAudioPreview', (d) => q().reading.audio = d, true); };
    document.getElementById('insertReadingAudioBtn').onclick = () => { document.getElementById('editReadingAudio').click(); };
    document.getElementById('readingAudioClearBtn').onclick = () => { clearMedia('readingAudioPreview', 'editReadingAudio', () => q().reading.audio = null, true); };
    
    document.getElementById('editQuestionImage').onchange = function() { handleBinaryUpload(this, 'questionImagePreview', (d) => q().question.image = d); };
    document.getElementById('questionImagePasteBtn').onclick = () => { pasteImageFromClipboard('questionImagePreview', (d) => q().question.image = d); };
    document.getElementById('questionImageClearBtn').onclick = () => { clearMedia('questionImagePreview', 'editQuestionImage', () => q().question.image = null); };
    
    for (let i = 1; i <= 4; i++) {
        document.getElementById('editOptionImage' + i).onchange = function() { handleBinaryUpload(this, 'optionImagePreview' + i, (d) => q().options[i-1].image = d); };
        document.getElementById('optionImagePasteBtn' + i).onclick = () => { pasteImageFromClipboard('optionImagePreview' + i, (d) => q().options[i-1].image = d); };
        document.getElementById('optionImageClearBtn' + i).onclick = () => { clearMedia('optionImagePreview' + i, 'editOptionImage' + i, () => q().options[i-1].image = null); };
    }
  }

  // === Initialization ===
  function init() {
    restore();
    populateEditForm(); // This will also call renderQuestionList
  }

  window.addEventListener('load', () => {
    attachEventListeners();
    init();
  });

})();
