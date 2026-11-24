<script setup lang="ts">
import { computed, ref } from 'vue';
import { Archive, ArchiveRestore, ChevronDown, ChevronRight, Folder, FolderPlus, MoveRight, Pencil } from 'lucide-vue-next';
import type { Conversation, Folder as FolderItem } from '../types/api';
import ConversationTreeItem from './ConversationTreeItem.vue';

defineOptions({ name: 'FolderTreeNode' });
const props = defineProps<{
  folder: FolderItem;
  folders: FolderItem[];
  conversations: Conversation[];
  selectedConversationId: string | null;
  depth: number;
}>();
const emit = defineEmits<{
  selectConversation: [conversation: Conversation];
  renameConversation: [conversation: Conversation];
  archiveConversation: [conversation: Conversation];
  restoreConversation: [conversation: Conversation];
  moveConversation: [conversation: Conversation];
  createFolder: [appId: string | null, parentFolderId: string];
  renameFolder: [folder: FolderItem];
  archiveFolder: [folder: FolderItem];
  restoreFolder: [folder: FolderItem];
  reparentFolder: [folder: FolderItem];
}>();
const expanded = ref(false);
const children = computed(() => props.folders.filter((item) => item.parent_folder_id === props.folder.folder_id));
const ownConversations = computed(() => props.conversations.filter((item) => item.folder_id === props.folder.folder_id));
</script>

<template>
  <div class="folder-branch" :class="{ 'archived-tree-item': folder.archived }" :style="{ '--depth': depth }">
    <div class="folder-tree-row">
      <button class="folder-toggle" type="button" :aria-expanded="expanded" @click="expanded = !expanded">
        <component :is="expanded ? ChevronDown : ChevronRight" :size="14" />
        <Folder :size="14" class="folder-icon" />
        <span>{{ folder.name }}</span>
        <small v-if="folder.archived" class="archive-status">arquivada</small>
      </button>
      <div class="tree-item-actions" aria-label="Ações da pasta">
        <button v-if="!folder.archived" class="tiny-icon" type="button" title="Criar subpasta" @click="emit('createFolder', folder.app_id, folder.folder_id)"><FolderPlus :size="13" /></button>
        <button class="tiny-icon" type="button" title="Renomear pasta" @click="emit('renameFolder', folder)"><Pencil :size="13" /></button>
        <button class="tiny-icon" type="button" title="Reorganizar pasta neste projeto" @click="emit('reparentFolder', folder)"><MoveRight :size="13" /></button>
        <button v-if="folder.archived" class="tiny-icon" type="button" title="Reabrir pasta" @click="emit('restoreFolder', folder)"><ArchiveRestore :size="13" /></button>
        <button v-else class="tiny-icon danger-hover" type="button" title="Arquivar pasta" @click="emit('archiveFolder', folder)"><Archive :size="13" /></button>
      </div>
    </div>
    <div v-if="expanded" class="folder-children">
      <ConversationTreeItem
        v-for="conversation in ownConversations"
        :key="conversation.conversation_id"
        :conversation="conversation"
        :selected="conversation.conversation_id === selectedConversationId"
        :nested="true"
        @select="emit('selectConversation', $event)"
        @rename="emit('renameConversation', $event)"
        @archive="emit('archiveConversation', $event)"
        @restore="emit('restoreConversation', $event)"
        @move="emit('moveConversation', $event)"
      />
      <FolderTreeNode
        v-for="child in children"
        :key="child.folder_id"
        :folder="child"
        :folders="folders"
        :conversations="conversations"
        :selected-conversation-id="selectedConversationId"
        :depth="depth + 1"
        @select-conversation="emit('selectConversation', $event)"
        @rename-conversation="emit('renameConversation', $event)"
        @archive-conversation="emit('archiveConversation', $event)"
        @restore-conversation="emit('restoreConversation', $event)"
        @move-conversation="emit('moveConversation', $event)"
        @create-folder="(appId, parentFolderId) => emit('createFolder', appId, parentFolderId)"
        @rename-folder="emit('renameFolder', $event)"
        @archive-folder="emit('archiveFolder', $event)"
        @restore-folder="emit('restoreFolder', $event)"
        @reparent-folder="emit('reparentFolder', $event)"
      />
    </div>
  </div>
</template>
