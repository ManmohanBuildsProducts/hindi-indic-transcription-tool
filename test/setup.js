// Mock electron
const electron = {
  app: {
    getPath: jest.fn(),
  },
  ipcMain: {
    handle: jest.fn(),
  },
  BrowserWindow: jest.fn().mockImplementation(() => ({
    loadFile: jest.fn(),
    webContents: {
      send: jest.fn(),
    },
  })),
};

// Mock electron-store
const Store = jest.fn().mockImplementation(() => ({
  get: jest.fn(),
  set: jest.fn(),
}));

jest.mock('electron', () => electron);
jest.mock('electron-store', () => Store);