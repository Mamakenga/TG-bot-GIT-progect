// Mock for PostgreSQL pg library
export const Pool = jest.fn(() => ({
  query: jest.fn(),
  connect: jest.fn(),
  end: jest.fn(),
}));

export const PoolClient = jest.fn(() => ({
  query: jest.fn(),
  release: jest.fn(),
}));
