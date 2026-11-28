// Imóveis de exemplo da Prévia 02 (Site com IA do Cliente). A Prévia 01 (Operação EIAH) continua lendo
// properties.mjs; aqui só as fotos mudam, para as duas prévias não mostrarem as mesmas imagens.
import { properties } from './properties.mjs';

const photo = name => new URL('./assets/previa02-' + name + '.webp', import.meta.url).href;

// Fotos próprias da Prévia 02 por imóvel. Imóvel sem entrada aqui mantém, por enquanto, as fotos de properties.mjs.
export const previa02Photos = Object.freeze({
  'v-01': ['v01-fachada', 'v01-cozinha'],
  'v-02': ['v02-fachada', 'v02-sala', 'v02-gourmet'],
  'v-03': ['v03-varanda', 'v03-quarto']
});

export const iaClienteProperties = properties.map(property =>
  previa02Photos[property.id] ? { ...property, fotos: previa02Photos[property.id].map(photo) } : property
);
