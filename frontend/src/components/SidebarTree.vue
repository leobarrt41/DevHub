<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  Archive, ArchiveRestore, ChevronDown, ChevronRight, FolderPlus, Layers3, MessageSquarePlus, Pencil,
  Plus, Search, X,
} from 'lucide-vue-next';
import type { Application, Conversation, Folder } from '../types/api';
import ConversationTreeItem from './ConversationTreeItem.vue';
import FolderTreeNode from './FolderTreeNode.vue';

const props = defineProps<{
  applications: Application[];
  folders: Folder[];
  conversations: Conversation[];
  selectedConversationId: string | null;
  mobileOpen: boolean;
  showArchived: boolean;
}>();
const emit = defineEmits<{
  createApplication: [];
  createConversation: [appId: string | null, folderId: string | null];
  createFolder: [appId: string | null, parentFolderId: string | null];
  renameApplication: [application: Application];
  archiveApplication: [application: Application];
  restoreApplication: [application: Application];
  renameFolder: [folder: Folder];
  archiveFolder: [folder: Folder];
  restoreFolder: [folder: Folder];
  reparentFolder: [folder: Folder];
  renameConversation: [conversation: Conversation];
  archiveConversation: [conversation: Conversation];
  restoreConversation: [conversation: Conversation];
  moveConversation: [conversation: Conversation];
  selectConversation: [conversation: Conversation];
  search: [];
  showArchived: [value: boolean];
  closeMobile: [];
}>();

const expandedApps = ref(new Set<string>());
const generalExpanded = ref(true);
watch(() => props.applications.map((app) => app.app_id).join('|'), () => {
  expandedApps.value = new Set([...expandedApps.value, ...props.applications.map((app) => app.app_id)]);
}, { immediate: true });
const generalConversations = computed(() => props.conversations.filter((conversation) => conversation.app_id === null && conversation.folder_id === null));
const generalRoots = computed(() => props.folders.filter((folder) => folder.app_id === null && folder.parent_folder_id === null));
const appConversations = (appId: string) => props.conversations.filter((item) => item.app_id === appId && item.folder_id === null);
const appRoots = (appId: string) => props.folders.filter((item) => item.app_id === appId && item.parent_folder_id === null);

function selectConversation(conversation: Conversation) {
  emit('selectConversation', conversation);
  emit('closeMobile');
}
</script>

<template>
  <aside class="sidebar" :class="{ 'sidebar-open': mobileOpen }" aria-label="Navegação de projetos e conversas">
    <header class="sidebar-header">
      <div class="brand-lockup compact-brand">
        <div class="brand-mark" aria-hidden="true"><span>DH</span></div>
        <div><strong>DevHub</strong><span class="brand-ai">AI</span></div>
      </div>
      <button class="icon-button mobile-only" type="button" aria-label="Fechar navegação" @click="emit('closeMobile')"><X :size="18" /></button>
    </header>

    <div class="sidebar-tools">
      <button class="new-chat-button" type="button" @click="emit('createConversation', null, null)">
        <MessageSquarePlus :size="16" /><span>Nova conversa</span>
      </button>
      <button class="search-button" type="button" @click="emit('search')"><Search :size="16" /><span>Pesquisar</span><span class="shortcut mono">⌘/Ctrl K</span></button>
      <button class="archive-toggle" type="button" :aria-pressed="showArchived" @click="emit('showArchived', !showArchived)">
        <component :is="showArchived ? ArchiveRestore : Archive" :size="14" />
        <span>{{ showArchived ? 'Ocultar arquivados' : 'Mostrar arquivados' }}</span>
      </button>
    </div>

    <div class="tree-section-head">
      <span>PROJETOS</span>
      <button class="tiny-icon" type="button" title="Criar aplicação" aria-label="Criar aplicação" @click="emit('createApplication')"><Plus :size="15" /></button>
    </div>

    <div class="tree-scroll">
      <section v-for="application in applications" :key="application.app_id" class="application-group" :class="{ 'archived-tree-item': application.archived }">
        <div class="application-row">
          <button class="application-toggle" type="button" :aria-expanded="expandedApps.has(application.app_id)" @click="expandedApps.has(application.app_id) ? expandedApps.delete(application.app_id) : expandedApps.add(application.app_id)">
            <component :is="expandedApps.has(application.app_id) ? ChevronDown : ChevronRight" :size="14" />
            <Layers3 :size="15" class="project-icon" />
            <span>{{ application.name }}</span>
            <small v-if="application.archived" class="archive-status">arquivado</small>
          </button>
          <div class="tree-item-actions" aria-label="Ações da aplicação">
            <template v-if="!application.archived">
              <button class="tiny-icon" type="button" title="Nova conversa no projeto" @click="emit('createConversation', application.app_id, null)"><MessageSquarePlus :size="13" /></button>
              <button class="tiny-icon" type="button" title="Nova pasta" @click="emit('createFolder', application.app_id, null)"><FolderPlus :size="13" /></button>
              <button class="tiny-icon" type="button" title="Renomear projeto" @click="emit('renameApplication', application)"><Pencil :size="13" /></button>
              <button class="tiny-icon danger-hover" type="button" title="Arquivar projeto" @click="emit('archiveApplication', application)"><Archive :size="13" /></button>
            </template>
            <template v-else>
              <button class="tiny-icon" type="button" title="Renomear projeto" @click="emit('renameApplication', application)"><Pencil :size="13" /></button>
              <button class="tiny-icon" type="button" title="Reabrir projeto" @click="emit('restoreApplication', application)"><ArchiveRestore :size="13" /></button>
            </template>
          </div>
        </div>
        <div v-if="expandedApps.has(application.app_id)" class="application-children">
          <ConversationTreeItem
            v-for="conversation in appConversations(application.app_id)"
            :key="conversation.conversation_id"
            :conversation="conversation"
            :selected="conversation.conversation_id === selectedConversationId"
            @select="selectConversation"
            @rename="emit('renameConversation', $event)"
            @archive="emit('archiveConversation', $event)"
            @restore="emit('restoreConversation', $event)"
            @move="emit('moveConversation', $event)"
          />
          <FolderTreeNode
            v-for="folder in appRoots(application.app_id)"
            :key="folder.folder_id"
            :folder="folder"
            :folders="folders"
            :conversations="conversations"
            :selected-conversation-id="selectedConversationId"
            :depth="0"
            @select-conversation="selectConversation"
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
          <p v-if="!appConversations(application.app_id).length && !appRoots(application.app_id).length" class="tree-empty">Sem conversas ou pastas.</p>
        </div>
      </section>

      <section class="general-section">
        <div class="tree-section-head general-head">
          <button class="section-toggle" type="button" :aria-expanded="generalExpanded" @click="generalExpanded = !generalExpanded">
            <component :is="generalExpanded ? ChevronDown : ChevronRight" :size="14" />
            <span>GERAIS</span>
          </button>
          <button class="tiny-icon" type="button" title="Nova conversa geral" @click="emit('createConversation', null, null)"><Plus :size="15" /></button>
        </div>
        <div v-if="generalExpanded" class="application-children">
          <ConversationTreeItem
            v-for="conversation in generalConversations"
            :key="conversation.conversation_id"
            :conversation="conversation"
            :selected="conversation.conversation_id === selectedConversationId"
            @select="selectConversation"
            @rename="emit('renameConversation', $event)"
            @archive="emit('archiveConversation', $event)"
            @restore="emit('restoreConversation', $event)"
            @move="emit('moveConversation', $event)"
          />
          <FolderTreeNode
            v-for="folder in generalRoots"
            :key="folder.folder_id"
            :folder="folder"
            :folders="folders"
            :conversations="conversations"
            :selected-conversation-id="selectedConversationId"
            :depth="0"
            @select-conversation="selectConversation"
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
          <p v-if="!generalConversations.length && !generalRoots.length" class="tree-empty">Nenhuma conversa geral.</p>
        </div>
      </section>
    </div>

    <footer class="sidebar-footer">
      <div class="sidebar-footer-mark"><span class="status-dot"></span> SINCRONIZAÇÃO ATIVA</div>
      <p v-if="showArchived">Reabra projetos e pastas por nível; conversas arquivadas precisam ser reabertas separadamente.</p>
      <p v-else>Árvore atualizada a cada 10 segundos</p>
    </footer>
  </aside>
</template>
