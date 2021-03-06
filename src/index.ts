import {Classification} from "./worker/types";

interface WorkerContentInJson {
  worker: string
}

/**
 * 高亮
 */
export class MonacoJsxSyntaxHighlight {
  private worker: Worker
  private monaco: any

  constructor(worker: string | Worker | WorkerContentInJson, monaco: any) {
    this.monaco = monaco
    if (typeof worker === 'string') {
      this.worker = new Worker(worker)
    } else if ((worker as WorkerContentInJson).worker && typeof (worker as WorkerContentInJson).worker === 'string') {
      this.worker = this.createWorkerFromPureString((worker as WorkerContentInJson).worker)
    } else {
      this.worker = worker as Worker
    }
  }

  private createWorkerFromPureString = (content: string) => {
    // URL.createObjectURL
    window.URL = window.URL || window.webkitURL
    let blob
    try {
      blob = new Blob([content], {type: 'application/javascript'})
    } catch (e) {
      // Backwards-compatibility
      (window as any).BlobBuilder = (window as any).BlobBuilder || (window as any).WebKitBlobBuilder || (window as any).MozBlobBuilder
      blob = new (window as any).BlobBuilder()
      blob.append(content)
      blob = blob.getBlob()
    }

    const worker =  new Worker(URL.createObjectURL(blob))
    // free
    URL.revokeObjectURL(blob)

    return worker
  }

  private generateCallbackKey = (filePath: string, version: string) => `<${filePath}><${version}>`

  public highlighterBuilder = (context: {
    editor: any,
    filePath?: string
  }) => {
    const {editor, filePath = editor.getModel().uri.toString()} = context
    const decorationsRef = {current: []}

    const disposeMessage = (event: MessageEvent) => {
      const {classifications, version, filePath: disposeFilePath} = event.data
      requestAnimationFrame(() => {
        // 确认为本文件，并且为最新版本
        if (
          disposeFilePath === filePath &&
          version === editor.getModel().getVersionId()
        ) {
          const preDecoration = decorationsRef.current
          decorationsRef.current = editor.deltaDecorations(
            preDecoration,
            classifications.map((classification: Classification) => ({
              range: new this.monaco.Range(
                classification.start.row,
                classification.start.column,
                classification.end.row,
                classification.end.column + 1
              ),
              options: {
                inlineClassName: classification.tokens.join(' ')
              }
            }))
          )
        }
      })
    }
    // 注册监听事件
    this.worker.addEventListener('message', disposeMessage)

    return {
      highlighter: (code?: string) => {
        requestAnimationFrame(() => {
          const disposeCode = code || editor.getModel().getValue()

          // send message to worker
          this.worker.postMessage({
            code: disposeCode,
            filePath,
            version: editor.getModel().getVersionId()
          })
        })
      },
      dispose: () => {
        this.worker.removeEventListener('message', disposeMessage)
      }
    }
  }
}