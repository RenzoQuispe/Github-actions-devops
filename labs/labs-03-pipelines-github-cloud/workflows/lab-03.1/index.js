export const handler = async (event) => {
    console.log("Hola desde AWS Lambda!");
    await new Promise(resolve => setTimeout(resolve, 3000));
    console.log("Inicio del proceso ...");
    await new Promise(resolve => setTimeout(resolve, 3000));
    const response = {
      statusCode: 200,
      body: JSON.stringify({
        message: "Proceso completado correctamente :D",
        timestamp: new Date().toISOString()
    })
    };
    return response;
  };
  