declare module 'jwk-to-pem' {
  interface JWK {
    kty: string;
    kid?: string;
    use?: string;
    n?: string; // RSA modulus
    e?: string; // RSA exponent
    crv?: string;
    x?: string;
    y?: string;
    d?: string;
  }
  function jwkToPem(jwk: JWK): string;
  export default jwkToPem;
}
