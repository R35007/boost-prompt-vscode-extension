import * as vscode from "vscode";
import { boostPrompt } from "./boostPrompt";
import { getSelectedLanguageModel } from "./utils";

export interface BoostPromptParams {
  promptText: string;
}

export class BoostPromptTool implements vscode.LanguageModelTool<BoostPromptParams> {
  constructor(private context: vscode.ExtensionContext) {}

  async invoke(options: vscode.LanguageModelToolInvocationOptions<BoostPromptParams>, _token: vscode.CancellationToken) {
    const { promptText } = options.input;

    // Select model
    const model = await getSelectedLanguageModel();
    if (!model) {
      vscode.window.showWarningMessage("No model selected, boost cancelled.");
      return;
    }

    const { result } = await boostPrompt(promptText, model, this.context);
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(result)]);
  }

  async prepareInvocation(_options: vscode.LanguageModelToolInvocationPrepareOptions<BoostPromptParams>, _token: vscode.CancellationToken) {
    return { invocationMessage: "Boosting your prompt..." };
  }
}
