import * as vscode from "vscode";
import {
  boostPromptOutputChannel,
  ensureInstructionFile,
  getInstructionFilePath,
  initializeAndCacheModels,
  logPatterns,
  selectModel,
} from "./utils";

import { BoostPromptTool } from "./boostPromptTool";
import { setupContextUpdates } from "./context";
import { boostPromptWithProgress } from "./boostPrompt";

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
  return vscode.commands.registerTextEditorCommand("boostPrompt.boost", async (editor: vscode.TextEditor) =>
    boostPromptWithProgress(context, editor)
  );
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

export function registerAgentTools(context: vscode.ExtensionContext) {
  context.subscriptions.push(vscode.lm.registerTool("boostPrompt", new BoostPromptTool(context)));
}

export function deactivate() {}
