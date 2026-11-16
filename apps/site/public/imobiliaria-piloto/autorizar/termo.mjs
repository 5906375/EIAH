export const TERM_VERSION = 'eiah-imoveis-divulgacao-v1-2026-11-16';
export const CHANNELS = Object.freeze({ site: 'Site EIAH Imóveis', instagram: 'Instagram EIAH', facebook: 'Facebook EIAH', linkedin: 'LinkedIn EIAH', whatsapp: 'Apresentação a interessados pelo WhatsApp', portais: 'Portais imobiliários identificados nas observações' });
export const ROLES = Object.freeze({ proprietario: 'Proprietário(a)', coproprietario: 'Coproprietário(a)', corretor: 'Corretor(a)', gestor: 'Gestor(a)', representante: 'Representante / procurador(a)' });
export const PURPOSES = Object.freeze({ venda: 'Venda', locacao: 'Locação', temporada: 'Locação por temporada' });

function clean(value, max = 600) { return String(value ?? '').trim().slice(0, max); }
export function buildAuthorization(input, now = new Date()) {
  const data = Object.fromEntries(['name','phone','email','role','ownerName','authority','creci','property','city','neighborhood','purpose','price','endDate','notes'].map(k => [k, clean(input[k], k === 'notes' ? 1500 : 600)]));
  if (!data.name || !data.phone || !data.ownerName || !data.property || !data.city || !data.neighborhood) throw new Error('Preencha a identificação do autorizante, do proprietário e do imóvel.');
  if (!ROLES[data.role] || !PURPOSES[data.purpose]) throw new Error('Escolha seu vínculo com o imóvel e a finalidade.');
  if (data.phone.replace(/\D/g, '').length < 10 || data.phone.replace(/\D/g, '').length > 13) throw new Error('Informe um telefone com DDD.');
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) throw new Error('Confira o e-mail informado.');
  if (data.role !== 'proprietario' && !data.authority) throw new Error('Descreva a autorização do proprietário ou os poderes de representação.');
  if (data.role === 'corretor' && !data.creci) throw new Error('Informe seu CRECI e a UF.');
  if (!input.authorityConfirmed || !input.materialConfirmed || !input.termsConfirmed) throw new Error('Confirme as declarações antes de gerar o termo.');
  const channels = [...new Set(Array.isArray(input.channels) ? input.channels : [])];
  if (!channels.length || channels.some(k => !CHANNELS[k])) throw new Error('Escolha ao menos um canal de divulgação válido.');
  if (channels.includes('portais') && !data.notes) throw new Error('Identifique os portais autorizados nas observações.');
  const price = Number(data.price);
  if (!Number.isFinite(price) || price <= 0 || price > 1e12) throw new Error('Informe um valor anunciado válido.');
  const today = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const end = new Date(`${data.endDate}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.endDate) || !Number.isFinite(end.getTime()) || end.toISOString().slice(0,10) !== data.endDate || data.endDate < today) throw new Error('Escolha uma data de término válida, a partir de hoje.');
  const currency = price.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const date = data.endDate.split('-').reverse().join('/');
  const text = `AUTORIZAÇÃO PARA DIVULGAÇÃO DE IMÓVEL — EIAH IMÓVEIS
Versão do termo: ${TERM_VERSION}
Gerado em: ${now.toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'})} (horário de Brasília)
DOCUMENTO PARA ASSINATURA — não enviado nem validado pelo site.

1. IDENTIFICAÇÃO
Autorizante: ${data.name}
Telefone: ${data.phone}${data.email ? `\nE-mail: ${data.email}` : ''}
Qualidade: ${ROLES[data.role]}${data.creci ? `\nCRECI do autorizante: ${data.creci}` : ''}
Proprietário(s) / titular(es) representado(s): ${data.ownerName}
Origem dos poderes / autorização: ${data.authority || 'Declaração de propriedade, sujeita à conferência documental.'}
Destinatária: Lene, CRECI 66990F, contato (47) 99994-1470, sob a identificação comercial EIAH Imóveis. A identificação civil completa da responsável deve constar na versão assinada.

2. IMÓVEL E OFERTA
Identificação / endereço completo (uso reservado à conferência): ${data.property}
Bairro: ${data.neighborhood} — Cidade/UF: ${data.city}
Finalidade da divulgação: ${PURPOSES[data.purpose]}
Valor autorizado para anúncio: ${currency}${data.purpose === 'temporada' ? ' por diária' : data.purpose === 'locacao' ? ' por mês (aluguel base)' : ''}
Condomínio, IPTU, taxas, condições e restrições devem ser conferidos antes da publicação.

3. ALCANCE DA AUTORIZAÇÃO
Autorizo a EIAH Imóveis, por intermédio da responsável acima identificada, a divulgar este imóvel, suas características, o valor acima e as fotografias, vídeos e textos que eu fornecer e tiver direito de autorizar, exclusivamente nos seguintes canais:
${channels.map(k => '- ' + CHANNELS[k]).join('\n')}
A divulgação pública deve limitar a localização ao bairro e cidade. Endereço completo, nome, telefone, e-mail e documentos do proprietário/autorizante não integram a autorização de publicação.
Permito ajustes de formato, recorte e correção de texto que não alterem as características reais do imóvel. Outros canais, mudança de preço ou ampliação material do uso exigem nova autorização.

4. PRAZO E CANCELAMENTO
Esta autorização começa com sua assinatura e é válida até ${date}. Posso solicitar a retirada dos anúncios ou alteração pelo contato da Lene: (47) 99994-1470. A solicitação será conferida e a retirada será providenciada nos canais sob gestão da responsável, com informação sobre eventuais limitações de plataformas de terceiros.

5. DECLARAÇÕES E LIMITES
Declaro que sou titular com poderes para autorizar ou possuo autorização válida e suficiente dos titulares, inclusive para compartilhar o material com a EIAH Imóveis. Apresentarei comprovação de propriedade, representação, anuência de outros titulares e direitos sobre o material quando solicitada. Ser corretor, gestor ou coproprietário, por si só, não comprova poderes suficientes para esta divulgação.
Declaro que as informações e materiais são verdadeiros e que comunicarei alterações de disponibilidade e condições. Evitarei fornecer imagens de pessoas identificáveis ou documentos pessoais para publicação sem autorização própria.
Este termo trata de divulgação, sem estabelecer exclusividade, comissão, administração, garantia de resultado ou poderes para assinar contratos, receber valores ou transferir direitos. Eventual intermediação, remuneração e demais serviços serão ajustados por instrumento próprio. Não autoriza tokenização nem emissão de ativos digitais.
A assinatura e a documentação serão conferidas pela responsável antes de publicar. O preenchimento e a geração deste arquivo não publicam anúncio nem comprovam recebimento, identidade, titularidade ou assinatura.

6. DADOS PESSOAIS
Os dados preenchidos neste formulário são usados localmente para gerar este termo; não são enviados pelo formulário nem salvos no armazenamento do navegador. Após o envio voluntário do documento assinado à responsável, serão usados para conferir a autorização, tratar o anúncio e manter o registro necessário, com acesso limitado aos envolvidos. O envio pelo WhatsApp utiliza também os serviços e as regras de privacidade dessa plataforma. Para informações, correção, retirada da divulgação e exercício de direitos sobre dados, contate Lene em (47) 99994-1470. Não há autorização para campanhas de marketing a terceiros neste termo.

7. OBSERVAÇÕES E RESTRIÇÕES
${data.notes || 'Nenhuma observação adicional informada.'}

Local e data da assinatura: ______________________________________
Nome civil completo da responsável / UF do CRECI: __________________
Assinatura do autorizante: ________________________________________
Assinatura de outros titulares / representantes, quando necessária:
_________________________________________________________________

Após assinar, encaminhe este termo e a comprovação de poderes à responsável por canal combinado. Guarde uma cópia. Modelo inicial sujeito à revisão jurídica e à conferência das partes antes do uso operacional.`;
  return Object.freeze({ text, version: TERM_VERSION, generatedAt: now.toISOString(), endDate: data.endDate });
}
