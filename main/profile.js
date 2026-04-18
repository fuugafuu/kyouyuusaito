import { DEFAULT_PROFILE_ICON, DEFAULT_PROFILE_NAME } from '../common/constants.js';
import { normalizeProfile } from '../common/models.js';
import { serializeError } from '../common/utils.js';
import { createProfileIconFromFile } from './attachments.js';

export function createProfileController({
  nameInput,
  iconInput,
  iconPreview,
  liveName,
  userKeyText,
  saveButton,
  resetButton,
  onSave,
  onStatus,
}) {
  let currentProfile = null;
  let pendingIcon = DEFAULT_PROFILE_ICON;

  function updatePreview() {
    iconPreview.src = pendingIcon || DEFAULT_PROFILE_ICON;
    liveName.textContent = nameInput.value.trim() || DEFAULT_PROFILE_NAME;
  }

  function setProfile(profile, userKey) {
    currentProfile = normalizeProfile(profile, userKey);
    pendingIcon = currentProfile.icon;
    nameInput.value = currentProfile.name;
    userKeyText.textContent = `userKey: ${userKey}`;
    updatePreview();
  }

  function getDraft() {
    if (!currentProfile) {
      throw new Error('プロフィールがまだ読み込まれていません。');
    }

    return normalizeProfile(
      {
        ...currentProfile,
        name: nameInput.value.trim() || DEFAULT_PROFILE_NAME,
        icon: pendingIcon || DEFAULT_PROFILE_ICON,
        updatedAt: Date.now(),
      },
      currentProfile.id,
    );
  }

  iconInput.addEventListener('change', async () => {
    const file = iconInput.files?.[0];
    if (!file) {
      return;
    }

    try {
      const result = await createProfileIconFromFile(file);
      pendingIcon = result.dataUrl;
      updatePreview();
      result.warnings.forEach((message) => onStatus(message, 'warning'));
    } catch (error) {
      onStatus(`アイコンの取り込みに失敗しました: ${serializeError(error)}`, 'error');
    } finally {
      iconInput.value = '';
    }
  });

  nameInput.addEventListener('input', updatePreview);

  resetButton.addEventListener('click', () => {
    pendingIcon = DEFAULT_PROFILE_ICON;
    updatePreview();
  });

  saveButton.addEventListener('click', async () => {
    try {
      await onSave(getDraft());
    } catch (error) {
      onStatus(`プロフィール保存に失敗しました: ${serializeError(error)}`, 'error');
    }
  });

  return {
    setProfile,
    getDraft,
  };
}
