import * as vscode from "vscode";
import { boostPromptOutputChannel, isBoostEnabledForFile } from "./utils";

/**
 * Determine whether Boost Prompt should be enabled based on the current active
 * editor or active tab (e.g., markdown preview webview).
 */
export async function determineBoostEnabledForActive(
  editor?: vscode.TextEditor
): Promise<{ enabled: boolean; source?: string; name?: string }> {
  // Prefer an active text editor (normal editing mode)
  if (editor) {
    const fileName = editor.document.fileName;
    boostPromptOutputChannel.appendLine(`\n${"=".repeat(60)}`);
    boostPromptOutputChannel.appendLine(`📌 Context Update: ${fileName}`);
    boostPromptOutputChannel.appendLine(`${"=".repeat(60)}`);

    const enabled = isBoostEnabledForFile(fileName);
    return { enabled, source: "editor", name: fileName };
  }

  // No active text editor — check active tab (possible webview such as markdown preview)
  try {
    const activeGroup = vscode.window.tabGroups.activeTabGroup;
    const activeTab = activeGroup?.activeTab;
    if (activeTab) {
      const input = activeTab.input as vscode.TabInputWebview | undefined;
      const viewType = input?.viewType;
      const tabLabel = activeTab.label;
      boostPromptOutputChannel.appendLine(`📌 Active tab detected: label=${tabLabel} viewType=${viewType}`);

      if (viewType && viewType.includes("markdown.preview")) {
        const nameToCheck = tabLabel ?? "";
        const enabled = isBoostEnabledForFile(nameToCheck);
        return { enabled, source: "preview", name: nameToCheck };
      }
    }
  } catch (err) {
    boostPromptOutputChannel.appendLine(`Error inspecting active tab for preview: ${String(err)}`);
  }

  return { enabled: false, source: "none" };
}

/**
 * Setup listeners and update context key `boostPrompt.filePatternMatches` when
 * the active editor/tab changes or configuration updates.
 */
export function setupContextUpdates(context: vscode.ExtensionContext) {
  async function updateContext() {
    const result = await determineBoostEnabledForActive(vscode.window.activeTextEditor);
    boostPromptOutputChannel.appendLine(`✋ Setting context: boostPrompt.filePatternMatches = ${result.enabled} (source=${result.source})`);
    await vscode.commands.executeCommand("setContext", "boostPrompt.filePatternMatches", result.enabled);
  }

  // Editor change listener
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      updateContext().catch((err) => boostPromptOutputChannel.appendLine(`Error updating context on editor change: ${err}`));
    })
  );

  // Tab change listener (webview/tab switches)
  if (vscode.window.tabGroups && typeof vscode.window.tabGroups.onDidChangeTabs === "function") {
    context.subscriptions.push(
      vscode.window.tabGroups.onDidChangeTabs(() => {
        updateContext().catch((err) => boostPromptOutputChannel.appendLine(`Error updating context on tab change: ${String(err)}`));
      })
    );
  }

  // Configuration change listener
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("boostPrompt.filePatterns")) {
        boostPromptOutputChannel.appendLine("⚙️  File patterns changed, updating context...");
        updateContext().catch((err) => boostPromptOutputChannel.appendLine(`Error updating context on config change: ${err}`));
      }
    })
  );

  // Initial update (delayed slightly to allow activation tasks to complete)
  setTimeout(async () => {
    boostPromptOutputChannel.appendLine("\n⏰ Initial context update (delayed 100ms)");
    await updateContext();
  }, 100);
}
