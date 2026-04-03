function normalizeValue(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function mapTaskFilesToAiDialogFiles(taskValue) {
  const taskFiles = Array.isArray(taskValue && taskValue.files) ? taskValue.files : [];
  return taskFiles
    .map((file, index) => {
      const fileUrl = normalizeValue(file && (file.resolvedUrl || file.url || file.previewUrl || file.previewPdfUrl || file.downloadUrl || file.fileUrl));
      if (!fileUrl) {
        return null;
      }
      const fileName = normalizeValue(file && (file.originalName || file.name || file.storedName)) || `Файл ${index + 1}`;
      const fileType = normalizeValue(file && file.type);
      const fileSize = Number(file && file.size) || 0;
      return {
        name: fileName,
        type: fileType,
        size: fileSize,
        url: fileUrl,
        resolvedUrl: fileUrl,
      };
    })
    .filter(Boolean);
}

export function openTelegramAiResponseModal(options = {}) {
  const task = options && options.task ? options.task : null;
  const entry = options && options.entry ? options.entry : null;
  const onStatus = typeof options.onStatus === 'function' ? options.onStatus : null;
  const openAiDialogSafely = typeof options.openAiDialogSafely === 'function' ? options.openAiDialogSafely : null;

  if (!openAiDialogSafely) {
    if (onStatus) {
      onStatus('error', 'Не удалось открыть окно ИИ.');
    }
    return;
  }

  const dialogFiles = mapTaskFilesToAiDialogFiles(task);
  openAiDialogSafely({
    task,
    entry,
    onStatus,
    files: dialogFiles,
    linkedFiles: dialogFiles,
    documentTitle: normalizeValue(task && (task.title || task.subject)) || 'Задача',
  });
}

export { mapTaskFilesToAiDialogFiles };
