create database orbitfolio;
use orbitfolio;

create table usuario (
id_user int primary key not null,
nome varchar (50) not null,
email varchar (30) not null,
senha varchar (20) not null,
pfp mediumblob,
descricao varchar (100)
);

create table competencia (
id_competencia int primary key not null,
nome varchar (50) not null,
descricao varchar (100) not null
);

create table usr_competencia (
id_uc int primary key not null, # id usuário e competencia
id_user int not null,
id_competencia int not null,
nivel_habilidade varchar (50),

foreign key (id_user)
references usuario (id_user),
foreign key (id_competencia)
references competencia (id_competencia)
);

create table portfolio (
id_portfolio int primary key not null,
id_user int not null,
nome varchar(50) not null,
data_criacao date,

foreign key (id_user)
references usuario (id_user)
);

create table projeto (
id_projeto int primary key not null,
id_portfolio int not null,
nome varchar (50) not null,
descricao varchar (100) not null,
data_criacao_projeto date,

foreign key (id_portfolio)
references portfolio (id_portfolio)
);

create table linguagem(
id_linguagem int primary key not null,
nome varchar (20) not null,
versão varchar (10) not null,
cor char(7) #valor hexadecimal
);

create table projeto_entidade(
id_pe int primary key not null, # id projeto e entidade
id_projeto int not null,
id_linguagem int not null,

foreign key (id_projeto)
references projeto (id_projeto),
foreign key (id_linguagem)
references linguagem (id_linguagem)
);

create table favorito (
id_fav int primary key not null,
id_user int not null,
id_projeto int not null,
data_favorito date,

foreign key (id_user)
references usuario (id_user),
foreign key (id_projeto)
references projeto (id_projeto)
);

create table curtida (
id_curtida int primary key not null,
id_user int not null,
id_projeto int not null,
data_curtida date,

foreign key (id_user)
references usuario (id_user),
foreign key (id_projeto)
references projeto (id_projeto)
);

create table comentario (
id_comentario int primary key not null,
id_user int not null,
id_projeto int not null,
data_comentario date,
texto varchar (100) not null,

foreign key (id_user)
references usuario (id_user),
foreign key (id_projeto)
references projeto (id_projeto)
);