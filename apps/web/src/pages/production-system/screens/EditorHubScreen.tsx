import { EditorHubView } from '../../newsroom/editor-hub/EditorHubView';
import { usePS } from '../context';

export default function EditorHubScreen() {
  const s = usePS();
  const { ps } = s;
  return (
    <EditorHubView
      editorTab={s.editorTab}
      setEditorTab={s.setEditorTab}
      articles={s.articles ?? []}
      buckets={s.buckets}
      onAdvance={s.handleAdvanceTo}
      onEdit={s.handleEdit}
      onNewInColumn={s.handleNewInColumn}
      onOpenStudio={s.handleOpenStudio}
      assignDialogArticle={s.assignDialogArticle}
      setAssignDialogArticle={s.setAssignDialogArticle}
      assignNote={s.assignNote}
      setAssignNote={s.setAssignNote}
      updateArticle={s.updateArticle}
      mediaItems={ps.mediaItems ?? []}
      horses={ps.horses ?? []}
      onOpenMediaForm={ps.handleOpenMediaForm}
      onMediaDelete={ps.handleMediaDelete}
      salesRecords={ps.salesRecords ?? []}
      reportRecords={ps.reportRecords ?? []}
      setEditSale={ps.setEditSale}
      setSalesFormOpen={ps.setSalesFormOpen}
      removeSale={ps.removeSale}
      setEditReport={ps.setEditReport}
      setReportFormOpen={ps.setReportFormOpen}
      removeReport={ps.removeReport}
    />
  );
}
