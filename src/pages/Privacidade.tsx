// Política de Privacidade pública — exigida pelo Google para publicar o app
// OAuth do Google Agenda (projeto "Infopro Hub Calendar").
export default function Privacidade() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-sm leading-relaxed text-foreground">
      <h1 className="mb-1 text-2xl font-semibold">Política de Privacidade</h1>
      <p className="mb-6 text-muted-foreground">Infopro Hub · atualizada em 8 de outubro de 2026</p>

      <h2 className="mb-2 mt-6 text-base font-semibold">O que é o Infopro Hub</h2>
      <p>O Infopro Hub é um sistema interno de gestão de projetos, atividades, documentos e agenda, usado pela equipe que o administra. O acesso exige login.</p>

      <h2 className="mb-2 mt-6 text-base font-semibold">Dados do Google que usamos</h2>
      <p>Quando você conecta sua conta do Google, o Infopro Hub acessa o seu Google Agenda para mostrar, criar, editar e excluir eventos dentro do próprio sistema, e o seu e-mail do Google para identificar a conta conectada.</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Os dados do Google Agenda são usados apenas para exibir e gerenciar a sua agenda dentro do Infopro Hub.</li>
        <li>Não vendemos, não compartilhamos e não usamos esses dados para publicidade.</li>
        <li>Os tokens de acesso ficam guardados criptografados no nosso servidor e nunca são enviados ao navegador.</li>
      </ul>
      <p className="mt-2">O uso de informações recebidas das APIs do Google segue a Política de Dados do Usuário dos Serviços de API do Google, incluindo os requisitos de uso limitado.</p>

      <h2 className="mb-2 mt-6 text-base font-semibold">Como remover o acesso</h2>
      <p>Você pode desconectar o Google Agenda a qualquer momento na tela Agenda do Infopro Hub, o que apaga os tokens guardados. Também pode revogar o acesso em myaccount.google.com/permissions.</p>

      <h2 className="mb-2 mt-6 text-base font-semibold">Contato</h2>
      <p>Dúvidas sobre privacidade: eu.daviqueiroz22@gmail.com</p>
    </main>
  );
}
