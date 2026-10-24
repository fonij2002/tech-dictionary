export function joinBase(path: string = '', base: string = '/') {
  return `${base.replace(/\/*$/, '/')}${path.replace(/^\/+/, '')}`;
}

export function withBase(path: string = '') {
  return joinBase(path, import.meta.env.BASE_URL);
}
