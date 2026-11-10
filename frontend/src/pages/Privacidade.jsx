import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import Header from "../components/layout/Header";
import "../styles/privacy.css";

const sections = [
  ["responsavel", "Responsável e contato"],
  ["dados", "Dados e finalidades"],
  ["armazenamento", "Favoritos, notas e armazenamento"],
  ["cookies", "Cookies e suas escolhas"],
  ["terceiros", "Serviços externos e compartilhamento"],
  ["bases", "Bases legais"],
  ["retencao", "Retenção e segurança"],
  ["direitos", "Seus direitos"],
  ["menores", "Crianças e adolescentes"],
  ["uso", "Informações sobre o uso do catálogo"],
  ["alteracoes", "Alterações desta política"],
];

export default function Privacidade({ onCookieSettings }) {
  const title = useRef(null);
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Política de Privacidade — BuscaGames";
    title.current?.focus({ preventScroll: true });
    return () => { document.title = previousTitle; };
  }, []);

  return <>
    <Header />
    <main className="privacy-page">
      <Link className="back-link" to="/">← Voltar ao catálogo</Link>
      <header className="privacy-heading">
        <p className="privacy-eyebrow">BuscaGames · Transparência</p>
        <h1 ref={title} tabIndex={-1}>Política de Privacidade</h1>
        <p>Entenda quais dados são usados, o que fica no seu navegador e como controlar suas escolhas.</p>
        <p className="privacy-updated">Última atualização: <time dateTime="2026-11-05">5 de novembro de 2026</time></p>
      </header>
      <aside className="privacy-summary" aria-label="Resumo de privacidade">
        <h2>Antes de explorar</h2>
        <ul>
          <li>O catálogo não exige conta. Novos favoritos, notas e comentários exigem login e ficam na conta. Registros antigos de visitante continuam disponíveis neste navegador.</li>
          <li>Perfis, bibliotecas de favoritos e avaliações, seguidores e pessoas seguidas são públicos. O e-mail e os dados de acesso não aparecem no perfil público.</li>
          <li>O catálogo funciona ao recusar cookies opcionais. O player do YouTube depende de permissão e da ação de ouvir.</li>
          <li>Fontes e imagens externas podem receber dados técnicos mesmo sem ativar o player.</li>
          <li>Dúvidas e solicitações: <a href="mailto:thur2402@outlook.com">thur2402@outlook.com</a>.</li>
        </ul>
      </aside>
      <nav className="privacy-index" aria-label="Nesta política">
        <h2>Nesta política</h2>
        <ol>{sections.map(([id, label]) => <li key={id}><a href={`#${id}`}>{label}</a></li>)}</ol>
      </nav>
      <article className="privacy-content" aria-label="Política completa">
        <section id="responsavel">
          <h2>1. Responsável e contato</h2>
          <p>Arthur Fernandes Pereira é o responsável pelo BuscaGames e pelo tratamento de dados realizado pelo site. Esta política abrange o catálogo, as páginas de jogos, a biblioteca pessoal e os recursos oferecidos neste domínio.</p>
          <p>Para assuntos de privacidade e exercício de direitos, escreva para <a href="mailto:thur2402@outlook.com">thur2402@outlook.com</a>, com o assunto “Privacidade — BuscaGames”. As políticas de serviços externos se aplicam ao tratamento realizado por esses serviços.</p>
        </section>
        <section id="dados">
          <h2>2. Dados e finalidades</h2>
          <ul>
            <li><strong>Navegação e consultas:</strong> a API recebe termos pesquisados, categorias, paginação e identificadores dos jogos consultados para entregar resultados e detalhes. Não inclua senhas, documentos ou outras informações pessoais no campo de busca.</li>
            <li><strong>Dados técnicos:</strong> ao acessar o site, a infraestrutura que atende a conexão recebe informações como endereço IP, endereço solicitado, data e hora e características do navegador enviadas nas requisições. Registros técnicos podem ser gerados pela hospedagem para operação, diagnóstico e segurança.</li>
            <li><strong>Biblioteca pessoal:</strong> identificadores dos favoritos e notas escolhidas permitem montar sua coleção e suas estatísticas. Para exibir jogos salvos, o navegador consulta seus identificadores na API; novos favoritos e avaliações são vinculados à conta no servidor.</li>
            <li><strong>Conta e comentários:</strong> guardamos nome, e-mail e, no cadastro por senha, um resumo criptográfico da senha para autenticação. Se você escolher Google, recebemos nome, e-mail verificado e o identificador da conta Google para criar a conta ou vinculá-la à sessão que você já iniciou. Não recebemos sua senha do Google. Comentários, nome de exibição, data e nota ficam públicos nas páginas de jogos. Você pode editar ou excluir seus comentários; sair da conta não os apaga.</li>
            <li><strong>Contato:</strong> ao enviar um e-mail, você fornece seu endereço, o conteúdo da mensagem e eventuais anexos para que sua solicitação seja atendida. Envie apenas o necessário.</li>
            <li><strong>Comunidade:</strong> nome, foto de perfil, plano de fundo, jogos favoritos, notas e listas de seguidores e pessoas seguidas podem ser consultados por visitantes. O plano de fundo enviado é salvo na conta e pode ser trocado ou removido no perfil. Relações de seguir e curtidas em comentários são armazenadas na conta; a interface mostra o total de curtidas e a sua própria escolha. Você pode deixar de seguir, descurtir, remover favoritos e ajustar ou remover notas. Registros antigos que existem apenas no navegador não são publicados.</li>
          </ul>
          <p>O catálogo pode ser explorado sem login. Avaliar, comentar e favoritar exige uma conta. Não há checkout, envio de documentos, anúncios personalizados ou ferramentas próprias de rastreamento publicitário. Não solicita CPF, endereço residencial, cartão de pagamento ou dados sensíveis para navegar.</p>
        </section>
        <section id="armazenamento">
          <h2>3. Favoritos, notas e armazenamento</h2>
          <p>Usamos o armazenamento local do navegador (localStorage), diferente de cookies, para consultar favoritos antigos em <code>buscagames:favorites</code> e avaliações antigas de visitante em <code>buscagames:ratings</code>. Uma versão anterior pode ter deixado notas em <code>buscagames:patches</code>, lidas para migração.</p>
          <p>Esses dados não têm expiração automática definida pelo site. Permanecem no perfil do navegador até serem alterados, apagados por você ou removidos pelo próprio navegador. Recusar cookies opcionais não apaga nem desativa a biblioteca. Em navegação privada ou com armazenamento bloqueado, as alterações podem durar apenas a sessão ou não persistir.</p>
          <p>Você pode desfavoritar jogos e ajustar suas notas na interface. Para apagar os registros locais, inclusive os antigos, feche as abas do BuscaGames e use as configurações de privacidade do navegador para limpar os dados deste site. A limpeza é local e pode ser irreversível. Ela não apaga favoritos, notas ou comentários que estão salvos na conta. Em dispositivos compartilhados, outras pessoas com acesso ao mesmo perfil podem ver sua biblioteca.</p>
          <p>Busca e filtros também podem aparecer no endereço da página e no histórico do navegador. Compartilhar esse endereço pode revelar os filtros e termos presentes nele; limpar os dados do site não necessariamente apaga o histórico.</p>
        </section>
        <section id="cookies">
          <h2>4. Cookies e suas escolhas</h2>
          <p>Ao entrar, usamos um cookie essencial de sessão por até 30 dias. Ele permite reconhecer sua conta e é removido ao sair. Recusar cookies opcionais não desativa esse recurso solicitado por você. Limpar o navegador não exclui comentários ou avaliações salvos na conta.</p>
          <p>Cookies são pequenos registros usados por sites e serviços no navegador. No BuscaGames, a escolha sobre cookies opcionais controla a disponibilidade do player incorporado do YouTube. Aceitar não inicia o player sozinho: também é necessário acionar a opção de ouvir. Se essa opção já tiver sido acionada, a aceitação pode iniciar a reprodução.</p>
          <p>O player usa o domínio youtube-nocookie.com, no modo de privacidade aprimorada. Isso não significa ausência de comunicação com o Google: ao carregar ou reproduzir conteúdo, o serviço recebe dados técnicos e pode usar identificadores e armazenamento conforme sua política.</p>
          <p>“Recusar opcionais”, fechar o aviso ou pressionar Escape dentro dele mantém o player bloqueado. A escolha é salva neste navegador e preservada ao recarregar ou abrir novamente o site, até ser alterada nas preferências ou removida ao limpar os dados do navegador. Com o armazenamento bloqueado, ela vale apenas nesta página.</p>
          <p>O aviso não aparece automaticamente para quem já fez uma escolha neste navegador ou está conectado à conta. Entrar na conta não autoriza cookies opcionais: você pode abrir “Preferências de cookies” a qualquer momento para escolher.</p>
          <p>Reabrir as preferências suspende o player e permite recusar novas ativações. Isso não remove dados já recebidos por terceiros nem apaga cookies que eles já tenham gravado; para isso, use as configurações do navegador e da sua conta no serviço.</p>
          <button className="btn-ghost" type="button" onClick={onCookieSettings}>Revisar preferências de cookies</button>
          <p>A recusa de opcionais não impede o carregamento das fontes e imagens externas descritas a seguir. Ler esta política ou continuar navegando não equivale a autorizar todos os tratamentos de dados.</p>
        </section>
        <section id="terceiros">
          <h2>5. Serviços externos e compartilhamento</h2>
          <ul>
            <li><strong>Hospedagem:</strong> a infraestrutura que entrega o site e sua API processa as requisições necessárias à navegação e pode manter registros técnicos.</li>
            <li><strong>IGDB:</strong> fornece metadados do catálogo; capas e imagens são carregadas diretamente de images.igdb.com, que recebe os dados técnicos dessas conexões. Consulte a <a href="https://www.igdb.com">IGDB e seu aviso de privacidade</a>.</li>
            <li><strong>Login com Google:</strong> a conexão só é iniciada ao escolher essa opção. Um cookie essencial temporário, com duração de até dez minutos, protege o retorno da autenticação. O vínculo é guardado na conta; tokens de acesso do Google não são armazenados. O uso do Google segue sua <a href="https://policies.google.com/privacy?hl=pt-BR">Política de Privacidade</a>.</li>
            <li><strong>Google Fonts:</strong> as fontes visuais são carregadas de servidores do Google ao abrir a página, independentemente da escolha sobre o player. Essas conexões expõem dados técnicos, como IP e cabeçalhos do navegador.</li>
            <li><strong>YouTube/Google:</strong> fornece o player opcional. O tratamento de fontes e mídia pelo Google está descrito na <a href="https://policies.google.com/privacy?hl=pt-BR">Política de Privacidade do Google</a>.</li>
            <li><strong>Steam e outras fontes do catálogo:</strong> o servidor consulta informações públicas de jogos, preços e requisitos. As notas pessoais não são enviadas a essas fontes. Ao abrir uma loja ou outro link externo, você passa a interagir diretamente com esse serviço.</li>
            <li><strong>E-mail:</strong> mensagens de contato passam pelos provedores de correio do remetente e do destinatário, incluindo o Outlook/Microsoft. Consulte a <a href="https://privacy.microsoft.com/pt-br/privacystatement">declaração de privacidade da Microsoft</a>.</li>
          </ul>
          <p>Links para Instagram, LinkedIn, Steam, Rockstar e outros sites levam a ambientes com políticas próprias. Dependendo do navegador e da configuração da conexão, provedores externos podem receber informações sobre a origem do acesso. Não há funcionalidade de venda de dados pessoais na aplicação.</p>
          <p>Serviços externos podem processar dados fora do Brasil. Os países, prazos e mecanismos adotados por cada provedor dependem de suas operações e políticas. O uso desses serviços não afasta os direitos previstos na legislação brasileira nem, quando aplicáveis, os requisitos para transferências internacionais.</p>
        </section>
        <section id="bases">
          <h2>6. Bases legais</h2>
          <p>A Lei Geral de Proteção de Dados Pessoais (LGPD) exige uma hipótese legal adequada para cada tratamento de dados pessoais. A permissão para ativar o player opcional é solicitada com base no consentimento, que pode ser revogado nas preferências.</p>
          <p>A prestação dos recursos solicitados pode envolver execução de contrato ou procedimentos relacionados, quando aplicável. Operação e proteção do serviço podem envolver legítimo interesse, observados necessidade, proporcionalidade e direitos do titular. Atendimento de obrigações e preservação de provas podem se apoiar em obrigação legal ou regulatória e exercício regular de direitos, conforme o caso.</p>
          <p>Essas hipóteses não são uma autorização genérica para novos usos. Você pode pedir esclarecimentos sobre a finalidade e a base legal de uma operação específica pelo contato de privacidade.</p>
        </section>
        <section id="retencao">
          <h2>7. Retenção e segurança</h2>
          <p>Os dados locais seguem o período explicado na seção de armazenamento. Consultas da API podem permanecer em cache na memória do servidor para agilizar respostas, até substituição, limpeza ou encerramento do processo; esse prazo não se aplica a registros de acesso da infraestrutura, histórico do navegador ou dados de terceiros.</p>
          <p>O prazo de retenção dos registros de hospedagem depende da configuração do ambiente em que o site é disponibilizado. Esta política não fixa um prazo que não esteja confirmado para esse ambiente. Para informações sobre registros de um acesso específico, entre em contato com o responsável.</p>
          <p>Mensagens de contato devem ser conservadas pelo tempo necessário ao atendimento e às obrigações legais ou à defesa de direitos aplicáveis. Você pode solicitar esclarecimentos e eliminação quando cabível. Os serviços externos definem seus próprios períodos de retenção, sujeitos à legislação.</p>
          <p>Nenhum sistema oferece segurança absoluta. Proteja o dispositivo, mantenha o navegador atualizado e não envie senhas ou documentos desnecessários por e-mail. Se identificar um incidente, informe o responsável. Incidentes com risco ou dano relevante devem ser tratados e comunicados conforme os requisitos legais aplicáveis.</p>
        </section>
        <section id="direitos">
          <h2>8. Seus direitos</h2>
          <p>Nos termos da LGPD e observadas as condições legais de cada pedido, você pode solicitar:</p>
          <ul>
            <li>Confirmação de tratamento, acesso e correção de dados.</li>
            <li>Anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados irregularmente.</li>
            <li>Portabilidade, conforme a regulamentação aplicável, e informação sobre compartilhamento.</li>
            <li>Informação sobre a possibilidade de não consentir e suas consequências, revogação do consentimento e eliminação dos dados tratados com consentimento, ressalvadas as hipóteses legais de conservação.</li>
            <li>Oposição ao tratamento em caso de descumprimento da LGPD e revisão de decisões exclusivamente automatizadas que afetem seus interesses, quando existentes.</li>
          </ul>
          <p>O BuscaGames não utiliza as notas da biblioteca para tomar decisões automatizadas com efeitos jurídicos sobre você. As estatísticas pessoais apenas resumem a coleção e os filtros escolhidos.</p>
          <p>Envie seu pedido gratuitamente para <a href="mailto:thur2402@outlook.com">thur2402@outlook.com</a>, descrevendo o direito e o contexto. Pode ser necessário confirmar sua identidade de forma proporcional para evitar divulgação indevida. Não envie documentos antes de serem necessários. A resposta deve observar os prazos e condições legais e explicar eventual impossibilidade de atendimento.</p>
          <p>Favoritos e notas mantidos somente no seu navegador precisam ser gerenciados nesse dispositivo; o responsável não consegue apagá-los remotamente. Você também pode recorrer à <a href="https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares">ANPD e consultar seus direitos</a>, inclusive quando não obtiver solução para uma solicitação.</p>
        </section>
        <section id="menores">
          <h2>9. Crianças e adolescentes</h2>
          <p>O catálogo pode apresentar jogos com diferentes classificações indicativas. Pais e responsáveis devem acompanhar o acesso de crianças e adolescentes, inclusive a vídeos, links e lojas externas. A exibição de um jogo não significa que seu conteúdo seja adequado para todas as idades.</p>
          <p>O site não pede data de nascimento nem oferece cadastro infantil. O tratamento de dados de crianças e adolescentes deve observar seu melhor interesse e as exigências específicas da LGPD, inclusive consentimento de responsável quando exigido. Se houver suspeita de coleta inadequada de dados de um menor, entre em contato para avaliação e providências cabíveis.</p>
        </section>
        <section id="uso">
          <h2>10. Informações sobre o uso do catálogo</h2>
          <p>O BuscaGames oferece descoberta e organização pessoal de jogos. Favoritar ou avaliar não compra, licencia ou transfere um jogo. Preços, disponibilidade, datas e informações vêm de fontes externas e podem mudar; confirme as condições na loja ou no site oficial antes de qualquer compra.</p>
          <p>Compras, pagamentos, contas e suporte de lojas externas são administrados por essas lojas. Esta política explica o tratamento de dados e não representa renúncia a direitos nem substitui as condições de um serviço externo.</p>
        </section>
        <section id="alteracoes">
          <h2>11. Alterações desta política</h2>
          <p>Esta política poderá ser atualizada quando houver mudanças nos recursos, serviços utilizados ou requisitos legais. A data no início identifica esta versão. Alterações relevantes devem ser informadas com clareza, e usos que dependam de novo consentimento devem solicitar uma nova escolha antes de sua ativação.</p>
          <p>Para esclarecer qualquer ponto, fale com Arthur Fernandes Pereira pelo e-mail <a href="mailto:thur2402@outlook.com">thur2402@outlook.com</a>.</p>
        </section>
      </article>
      <Link className="btn-ghost" to="/">Voltar ao catálogo</Link>
    </main>
  </>;
}
