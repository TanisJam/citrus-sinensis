// One owner per mount; GLTFLoader may resolve after React has unmounted.
export function createAssetSlot() {
  let current
  let closed = false
  return {
    get closed() { return closed },
    accept(asset) {
      if (closed) { asset.dispose(); return false }
      current = asset
      return true
    },
    close() {
      if (closed) return
      closed = true
      current?.dispose()
      current = undefined
    },
  }
}
