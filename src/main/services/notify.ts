import { Notification } from 'electron'
import { getConfigValue } from './store'

export function notify(title: string, body: string, options?: { silent?: boolean }): void {
  if (!getConfigValue('showTrayNotifications')) return
  if (!Notification.isSupported()) return
  try {
    const n = new Notification({
      title,
      body,
      silent: options?.silent ?? true
    })
    n.show()
  } catch {
    // Notifications can fail in some Windows configurations — ignore.
  }
}
