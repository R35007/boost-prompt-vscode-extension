import * as vscode from "vscode";
import { boostPrompt } from "./boostPrompt";
import {
  boostPromptOutputChannel,
  ensureInstructionFile,
  getEnabledPatternsMessage,
  getInstructionFilePath,
  getSelectedLanguageModel,
  initializeAndCacheModels,
  isBoostEnabledForFile,
  logPatterns,
  selectModel,
} from "./utils";

// Re-export utilities for external use
export { findModelByName, getAvailableModels, readInstructionFile } from "./utils";
export { boostPromptOutputChannel };

export function activate(context: vscode.ExtensionContext) {
  boostPromptOutputChannel.appendLine("\n✅ Boost Prompt Extension Activating...");

  // Initialize
  boostPromptOutputChannel.appendLine("🔍 Initializing models and instruction file...");
  initializeAndCacheModels();
  ensureInstructionFile(context);
  logPatterns();

  // Register commands
  context.subscriptions.push(registerBoostCommand(context));
  context.subscriptions.push(registerSelectModelCommand());
  context.subscriptions.push(registerEditInstructionsCommand(context));

  // Setup context updates
  setupContextUpdates(context);

  // Register agent tools
  context.subscriptions.push(vscode.lm.registerTool("boostPrompt", new BoostPromptTool(context)));
}

function registerBoostCommand(context: vscode.ExtensionContext) {
  return vscode.commands.registerTextEditorCommand("boostPrompt.boost", async (editor: vscode.TextEditor) => {
    boostPromptOutputChannel.appendLine(
      `\n${"=".repeat(60)}\n✨ Boost Prompt invoked\nFile: ${editor.document.fileName}\n${"=".repeat(60)}`
    );

    if (!isBoostEnabledForFile(editor.document.fileName)) {
      vscode.window.showErrorMessage(`Not enabled for this file. To enable all: ["*"] or []. Patterns: ${getEnabledPatternsMessage()}`);
      return;
    }

    // Select model
    const model = await getSelectedLanguageModel();
    if (!model) return vscode.window.showWarningMessage("No model selected, boost cancelled.");
    boostPromptOutputChannel.appendLine(`Using: ${model.name}`);

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `Boosting prompt :`, cancellable: true },
      async (progress, token) => {
        const text = editor.selection.isEmpty ? editor.document.getText() : editor.document.getText(editor.selection);

        // Rotating progress messages every 2 seconds (emoji-enhanced)
        const statusMessages = [
          `⏳ Preparing your prompt...`,
          `🔎 Analyzing intent and examples...`,
          `🔧 Enhancing clarity and constraints...`,
          `🧠 Adding context and relevant facts...`,
          `✍️ Polishing wording and formatting...`,
          `📚 Adding examples and edge-cases...`,
          `🔒 Trimming sensitive details if present...`,
          `✨ Strengthening specificity and tone...`,
          `🚀 Finalizing boost with ${model.name}...`,
          `🎉 Almost there — applying final touches...`,
          `✅ Ready shortly...`,
        ];
        let msgIdx = 0;
        try {
          progress.report({ message: statusMessages[msgIdx] });
        } catch {
          // Progress might have been closed, ignore errors
        }

        const interval = setInterval(() => {
          try {
            msgIdx = (msgIdx + 1) % statusMessages.length;
            progress.report({ message: statusMessages[msgIdx] });
          } catch {
            // Progress might have been closed, ignore errors
          }
        }, 2000);

        const cancelHandler = () => {
          clearInterval(interval as unknown as number);
          boostPromptOutputChannel.appendLine("Cancelled by user");
          vscode.window.showInformationMessage("Cancelled");
        };

        const cancelDisposable = token.onCancellationRequested(cancelHandler);

        try {
          if (token.isCancellationRequested) {
            cancelHandler();
            return;
          }

          const { result, status } = await boostPrompt(text, model, context);

          if (status === "terminated") {
            boostPromptOutputChannel.appendLine("Terminated - no model selected");
            vscode.window.showWarningMessage("Terminated: no model selected");
            return;
          }

          if (status === "failed") {
            boostPromptOutputChannel.appendLine("Failed");
            vscode.window.showErrorMessage("❌ Failed to boost. Check output channel", "Open BoostPrompt Output").then((selection) => {
              if (selection === "Open BoostPrompt Output") {
                boostPromptOutputChannel.show(true);
              }
            });
            return;
          }

          if (token.isCancellationRequested) {
            cancelHandler();
            return;
          }

          if (status === "success") {
            await editor.edit((edit) => {
              if (editor.selection.isEmpty) {
                const start = new vscode.Position(0, 0);
                const end = new vscode.Position(
                  editor.document.lineCount - 1,
                  editor.document.lineAt(editor.document.lineCount - 1).text.length
                );
                edit.replace(new vscode.Range(start, end), result);
              } else {
                edit.replace(editor.selection, result);
              }
            });
            boostPromptOutputChannel.appendLine("Success");
            vscode.window.showInformationMessage("✅ Boost Prompted successfully!");
          }
        } finally {
          clearInterval(interval as unknown as number);
          try {
            cancelDisposable.dispose();
          } catch {
            // Ignore if already disposed
          }
        }
      }
    );
  });
}

function registerSelectModelCommand() {
  return vscode.commands.registerCommand("boostPrompt.selectModel", selectModel);
}

function registerEditInstructionsCommand(context: vscode.ExtensionContext) {
  return vscode.commands.registerCommand("boostPrompt.editInstructions", async () => {
    const doc = await vscode.workspace.openTextDocument(getInstructionFilePath(context));
    await vscode.window.showTextDocument(doc);
  });
}

function setupContextUpdates(context: vscode.ExtensionContext) {
  async function updateContext() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      boostPromptOutputChannel.appendLine("📌 No active editor");
      await vscode.commands.executeCommand("setContext", "boostPrompt.filePatternMatches", false);
      return;
    }

    const fileName = editor.document.fileName;
    boostPromptOutputChannel.appendLine(`\n${"=".repeat(60)}`);
    boostPromptOutputChannel.appendLine(`📌 Context Update: ${fileName}`);
    boostPromptOutputChannel.appendLine(`${"=".repeat(60)}`);

    const enabled = isBoostEnabledForFile(fileName);
    boostPromptOutputChannel.appendLine(`✋ Setting context: boostPrompt.filePatternMatches = ${enabled}`);

    await vscode.commands.executeCommand("setContext", "boostPrompt.filePatternMatches", enabled);
  }

  // Editor change listener - properly handle async
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      updateContext().catch((err) => boostPromptOutputChannel.appendLine(`Error updating context on editor change: ${err}`));
    })
  );

  // Configuration change listener
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("boostPrompt.filePatterns")) {
        boostPromptOutputChannel.appendLine("⚙️  File patterns changed, updating context...");
        updateContext().catch((err) => boostPromptOutputChannel.appendLine(`Error updating context on config change: ${err}`));
      }
    })
  );

  // Initial context update with proper async handling
  setTimeout(async () => {
    boostPromptOutputChannel.appendLine("\n⏰ Initial context update (delayed 100ms)");
    await updateContext();
  }, 100);
}

export function registerAgentTools(context: vscode.ExtensionContext) {
  context.subscriptions.push(vscode.lm.registerTool("boostPrompt", new BoostPromptTool(context)));
}

interface BoostPromptParams {
  promptText: string;
}

class BoostPromptTool implements vscode.LanguageModelTool<BoostPromptParams> {
  constructor(private context: vscode.ExtensionContext) {}

  async invoke(options: vscode.LanguageModelToolInvocationOptions<BoostPromptParams>, _token: vscode.CancellationToken) {
    const { promptText } = options.input;

    // Select model
    const model = await getSelectedLanguageModel();
    if (!model) {
      vscode.window.showWarningMessage("No model selected, boost cancelled.");
      return;
    }
    boostPromptOutputChannel.appendLine(`Using: ${model.name}`);

    const { result } = await boostPrompt(promptText, model, this.context);
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(result)]);
  }

  async prepareInvocation(_options: vscode.LanguageModelToolInvocationPrepareOptions<BoostPromptParams>, _token: vscode.CancellationToken) {
    return { invocationMessage: "Boosting your prompt..." };
  }
}

export function deactivate() {}
