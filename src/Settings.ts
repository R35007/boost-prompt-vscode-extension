import * as vscode from "vscode";
import { boostPromptOutputChannel } from "./utils";

export class Settings {
  static get configuration() {
    return vscode.workspace.getConfiguration("boostPrompt");
  }
  static getSettings(val: string) {
    return Settings.configuration.get(val);
  }
  static setSettings(key: string, val: any, isGlobal = true) {
    return Settings.configuration.update(key, val, isGlobal);
  }

  static get filePatterns() {
    return (Settings.getSettings("filePatterns") as string[]) || ["*"];
  }
  static get preferredModel() {
    return Settings.getSettings("preferredModel") as string;
  }
  static set preferredModel(value: string) {
    Settings.setSettings("preferredModel", value);
    boostPromptOutputChannel.appendLine(`Preferred model updated to: ${value}`);
  }
}
