import * as fs from "fs";
import { minimatch } from "minimatch";
import * as path from "path";
import * as vscode from "vscode";

// Export output channel immediately
export const boostPromptOutputChannel = vscode.window.createOutputChannel("BoostPrompt");

// ============================================================================
// Model Management Utilities
// ============================================================================

let cachedAvailableModels: vscode.LanguageModelChat[] = [];

export async function initializeAndCacheModels(): Promise<void> {
  try {
    const models = await vscode.lm.selectChatModels({ vendor: "copilot" });
    const filteredModels = models.filter(({ id }) => id !== "auto");
    if (models?.length) {
      cachedAvailableModels = filteredModels;
      boostPromptOutputChannel.appendLine(`Discovered ${models.length} model(s): ${models.map((m) => m.name).join(", ")}`);
    } else {
      boostPromptOutputChannel.appendLine("No available models found");
    }
  } catch (err) {
    boostPromptOutputChannel.appendLine(`Error discovering models: ${String(err)}`);
  }
}

export function getAvailableModels(): vscode.LanguageModelChat[] {
  return cachedAvailableModels;
}

export function findModelByName(modelName: string): vscode.LanguageModelChat | undefined {
  return cachedAvailableModels.find((m) => m.name === modelName);
}

export async function selectModel(): Promise<vscode.LanguageModelChat | undefined> {
  if (cachedAvailableModels.length === 0) {
    vscode.window.showErrorMessage("No language models available. Please ensure you have Copilot Chat enabled.");
    return undefined;
  }

  const selected = await vscode.window.showQuickPick(
    cachedAvailableModels.map((model) => ({
      label: model.name,
      description: model.family || "Copilot Model",
      model,
    })),
    {
      title: "Select a Language Model",
      placeHolder: "Choose a model to boost your prompt",
    }
  );

  if (selected?.model) {
    vscode.window.showInformationMessage(`Selected: ${selected?.model.name}`);
    await setPreferredModel(selected?.model.name);
    return selected?.model;
  }

  boostPromptOutputChannel.appendLine("Model selection cancelled");
  return undefined;
}

export function getPreferredModel(): string {
  return vscode.workspace.getConfiguration("boostPrompt").get("preferredModel", "");
}

export async function setPreferredModel(modelName: string): Promise<void> {
  await vscode.workspace.getConfiguration("boostPrompt").update("preferredModel", modelName, vscode.ConfigurationTarget.Global);
  boostPromptOutputChannel.appendLine(`Preferred model updated to: ${modelName}`);
}

// ============================================================================
// File Pattern Utilities
// ============================================================================

export function isBoostEnabledForFile(fileName: string): boolean {
  const patterns = vscode.workspace.getConfiguration("boostPrompt").get("filePatterns", ["*.prompt.md"]) as string[] | null | undefined;

  // Enable for all files if no patterns, empty array, or wildcard
  if (!patterns || patterns.length === 0) {
    boostPromptOutputChannel.appendLine(`   ✅ No patterns configured - ENABLING FOR ALL FILES`);
    return true;
  }

  if (patterns.includes("*")) {
    boostPromptOutputChannel.appendLine(`   ✅ Wildcard "*" found - ENABLING FOR ALL FILES`);
    return true;
  }

  const baseName = fileName.split(/[/\\]/).pop() || fileName;
  boostPromptOutputChannel.appendLine(`   🔍 Full path: "${fileName}"`);
  boostPromptOutputChannel.appendLine(`   🔍 Basename: "${baseName}"`);
  boostPromptOutputChannel.appendLine(`   🔍 Patterns to match: [${patterns.join(", ")}]`);

  const matches = patterns.some((pattern) => {
    const result = minimatch(baseName, pattern);
    boostPromptOutputChannel.appendLine(`      • "${pattern}": ${result ? "✓ MATCH" : "✗ NO MATCH"}`);
    return result;
  });

  boostPromptOutputChannel.appendLine(`   ✅ FINAL: ${matches ? "ENABLED ✓" : "DISABLED ✗"}`);
  return matches;
}

// ============================================================================
// File I/O Utilities
// ============================================================================

const DEFAULT_BOOST_INSTRUCTIONS = `You are a professional prompt engineer specializing in crafting precise, effective prompts.
Your task is to enhance prompts by making them more specific, actionable, and effective.

**Formatting Requirements:**
- Use Markdown formatting in your response.
- Present requirements, constraints, and steps as bulleted or numbered lists.
- Separate context, instructions, and examples into clear paragraphs.
- Use headings if appropriate.
- Ensure the prompt is easy to read and visually organized.

**Instructions:**
- Improve the user prompt wrapped in \`<original_prompt>\` tags.
- Make instructions explicit and unambiguous.
- Add relevant context and constraints.
- Remove redundant information.
- Maintain the core intent.
- Ensure the prompt is self-contained.
- Use professional language.
- Add references to documentation or examples if applicable.

**For invalid or unclear prompts:**
- Respond with clear, professional guidance.
- Keep responses concise and actionable.
- Maintain a helpful, constructive tone.
- Focus on what the user should provide.
- Use a standard template for consistency.

**IMPORTANT:**
Your response must ONLY contain the enhanced prompt text, formatted as described.
Do not include any explanations, metadata, or wrapper tags.`;

export function getInstructionFilePath(context: vscode.ExtensionContext): string {
  return path.join(context.globalStoragePath, "boost.prompt.md");
}

export async function ensureInstructionFile(context: vscode.ExtensionContext): Promise<void> {
  try {
    const filePath = getInstructionFilePath(context);
    if (!fs.existsSync(context.globalStoragePath)) {
      fs.mkdirSync(context.globalStoragePath, { recursive: true });
    }
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, DEFAULT_BOOST_INSTRUCTIONS, "utf-8");
      boostPromptOutputChannel.appendLine(`Created instruction file at: ${filePath}`);
    }
  } catch (err) {
    boostPromptOutputChannel.appendLine(`Error ensuring instruction file: ${String(err)}`);
  }
}

export function readInstructionFile(context: vscode.ExtensionContext): string {
  try {
    const filePath = getInstructionFilePath(context);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, "utf-8");
    }
  } catch (err) {
    boostPromptOutputChannel.appendLine(`Error reading instruction file: ${String(err)}`);
  }
  return DEFAULT_BOOST_INSTRUCTIONS;
}

// ============================================================================
// UI/Configuration Utilities
// ============================================================================

export function logPatterns(): void {
  const patterns = vscode.workspace.getConfiguration("boostPrompt").get("filePatterns", ["*.prompt.md"]) as string[];
  boostPromptOutputChannel.appendLine(`📋 Configured file patterns: [${patterns.join(", ")}]`);
}

export function getEnabledPatternsMessage(): string {
  const patterns = vscode.workspace.getConfiguration("boostPrompt").get("filePatterns", ["*.prompt.md"]) as string[];
  return patterns.length > 0 ? patterns.join(", ") : "(empty - enables for all files)";
}

/**
 * Select language model for boosting
 * Flow: preferred model → available → user picker
 */
export async function getSelectedLanguageModel(): Promise<vscode.LanguageModelChat | undefined> {
  const availableModels = getAvailableModels();

  if (availableModels.length === 0) {
    vscode.window.showErrorMessage("No language models available. Enable Copilot Chat.");
    boostPromptOutputChannel.appendLine("No models available");
    return undefined;
  }

  const preferredName = getPreferredModel();

  if (preferredName) {
    const preferred = findModelByName(preferredName);
    if (preferred) {
      boostPromptOutputChannel.appendLine(`Using preferred: ${preferred.name}`);
      return preferred;
    }

    const action = await vscode.window.showWarningMessage(`Preferred model "${preferredName}" not found. Select new?`, "Select Model");

    if (action !== "Select Model") {
      boostPromptOutputChannel.appendLine("Model selection cancelled");
      return undefined;
    }
  }

  return selectModel();
}
