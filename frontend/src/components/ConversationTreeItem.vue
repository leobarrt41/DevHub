<script setup lang="ts">
import { Archive, ArchiveRestore, MessageSquare, MoveRight, Pencil } from 'lucide-vue-next';
import type { Conversation } from '../types/api';

defineProps<{ conversation: Conversation; selected: boolean; nested?: boolean }>();
const emit = defineEmits<{
  select: [conversation: Conversation];
  rename: [conversation: Conversation];
  archive: [conversation: Conversation];
  restore: [conversation: Conversation];
  move: [conversation: Conversation];
}>();
</script>

<template>
  <div class="conversation-tree-item" :class="{ selected, nested, 'archived-tree-item': conversation.archived }">
    <button class="conversation-select" type="button" :title="conversation.title" @click="emit('select', conversation)">
      <MessageSquare :size="14" aria-hidden="true" />
      <span>{{ conversation.title }}</span>
      <small v-if="conversation.archived" class="archive-status">arquivada</small>
    </button>
    <div class="tree-item-actions" aria-label="Ações da conversa">
      <button class="tiny-icon" type="button" title="Renomear conversa" @click="emit('rename', conversation)"><Pencil :size="13" /></button>
      <button v-if="!conversation.archived" class="tiny-icon" type="button" title="Mover conversa" @click="emit('move', conversation)"><MoveRight :size="13" /></button>
      <button v-if="conversation.archived" class="tiny-icon" type="button" title="Reabrir conversa" @click="emit('restore', conversation)"><ArchiveRestore :size="13" /></button>
      <button v-else class="tiny-icon danger-hover" type="button" title="Arquivar conversa" @click="emit('archive', conversation)"><Archive :size="13" /></button>
    </div>
  </div>
</template>
