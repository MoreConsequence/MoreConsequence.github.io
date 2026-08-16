import Fastify from "fastify";
const app = Fastify();
for (let i = 0; i < 200; i++) app.get(`/api/resource${i}/${i % 10}`, async () => ({ hit: `${i}` }));
app.listen({ port: 4104 }, () => console.log("bomb-fastify on 4104"));
