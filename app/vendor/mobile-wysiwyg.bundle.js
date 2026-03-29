(function attachMobileWysiwyg(global) {
  function createToolbarButtonState(button, active) {
    if (!button) return;
    button.classList.toggle('is-active', !!active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  }

  function MobileWysiwyg(options) {
    if (!options || !options.mount) throw new Error('MobileWysiwyg: mount element is required');
    this.mount = options.mount;
    this.toolbar = options.toolbar || null;
    this.editor = document.createElement('div');
    this.editor.className = 'appdosc-ai-dialog__docx-editor-surface';
    this.editor.contentEditable = 'true';
    this.editor.spellcheck = true;
    this.editor.setAttribute('role', 'textbox');
    this.editor.setAttribute('aria-multiline', 'true');
    this.mount.innerHTML = '';
    this.mount.appendChild(this.editor);
    this.handleSelectionChange = this.handleSelectionChange.bind(this);
    document.addEventListener('selectionchange', this.handleSelectionChange);
  }

  MobileWysiwyg.prototype.focus = function focus() {
    this.editor.focus();
  };

  MobileWysiwyg.prototype.setHTML = function setHTML(html) {
    this.editor.innerHTML = String(html || '').trim();
  };

  MobileWysiwyg.prototype.getHTML = function getHTML() {
    return String(this.editor.innerHTML || '').trim();
  };

  MobileWysiwyg.prototype.insertAtCursor = function insertAtCursor(html) {
    this.focus();
    const selection = global.getSelection();
    if (!selection || selection.rangeCount === 0) {
      this.editor.insertAdjacentHTML('beforeend', html);
      return;
    }
    const range = selection.getRangeAt(0);
    if (!this.editor.contains(range.commonAncestorContainer)) {
      this.editor.insertAdjacentHTML('beforeend', html);
      return;
    }
    const fragment = range.createContextualFragment(html);
    range.deleteContents();
    range.insertNode(fragment);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  MobileWysiwyg.prototype.exec = function exec(command, value) {
    this.focus();
    document.execCommand(command, false, value);
    this.handleSelectionChange();
  };

  MobileWysiwyg.prototype.handleSelectionChange = function handleSelectionChange() {
    if (!this.toolbar) return;
    const selection = global.getSelection();
    const hasSelection = !!(selection && selection.rangeCount > 0 && this.editor.contains(selection.anchorNode));
    if (!hasSelection) return;
    createToolbarButtonState(this.toolbar.querySelector('[data-action="bold"]'), document.queryCommandState('bold'));
    createToolbarButtonState(this.toolbar.querySelector('[data-action="italic"]'), document.queryCommandState('italic'));
    createToolbarButtonState(this.toolbar.querySelector('[data-action="list"]'), document.queryCommandState('insertUnorderedList'));
  };

  MobileWysiwyg.prototype.run = function run(action) {
    switch (action) {
      case 'bold':
        this.exec('bold');
        break;
      case 'italic':
        this.exec('italic');
        break;
      case 'heading': {
        const current = document.queryCommandValue('formatBlock');
        const normalized = String(current || '').toLowerCase();
        this.exec('formatBlock', normalized === 'h2' ? 'p' : 'h2');
        break;
      }
      case 'list':
        this.exec('insertUnorderedList');
        break;
      case 'link': {
        const raw = global.prompt('Введите URL ссылки', 'https://');
        if (!raw) return;
        const url = String(raw).trim();
        if (!url) return;
        this.exec('createLink', url);
        break;
      }
      case 'table':
        this.insertAtCursor(
          '<table><tbody><tr><th>Колонка 1</th><th>Колонка 2</th></tr><tr><td>Текст</td><td>Текст</td></tr></tbody></table><p></p>',
        );
        break;
      default:
        break;
    }
  };

  MobileWysiwyg.prototype.destroy = function destroy() {
    document.removeEventListener('selectionchange', this.handleSelectionChange);
    if (this.mount) this.mount.innerHTML = '';
  };

  global.AppDocsMobileWysiwyg = {
    create(options) {
      return new MobileWysiwyg(options);
    },
  };
})(window);
