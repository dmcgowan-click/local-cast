import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

/** Constructor arguments for the ApiGateway component. */
export interface ApiGatewayArgs {
  /** Project name prefix for AWS resource names. */
  projectName: string;
  /** The Lambda function to proxy requests to. */
  lambdaFn: aws.lambda.Function;
  /** The Lambda authorizer function for protected routes (cookie + origin header). */
  authorizerFn: aws.lambda.Function;
  /** The Lambda authorizer function for unprotected routes (origin header only). */
  originVerifyFn: aws.lambda.Function;
}

/**
 * API Gateway HTTP API with route-level authorization.
 *
 * All routes require the x-origin-verify header injected by CloudFront,
 * ensuring direct API Gateway access is blocked.
 *
 * Unprotected routes (/api/auth, /api/health) are validated by the origin-verify
 * authorizer (header only). Protected routes (/api/media) require a valid session
 * cookie verified by the full Lambda authorizer — unauthorized requests are
 * rejected at the gateway and never reach the backend, reducing DoS exposure.
 *
 * Uses a default stage with auto-deploy and request throttling.
 */
export class ApiGateway extends pulumi.ComponentResource {
  /** The HTTP API resource. */
  public readonly api: aws.apigatewayv2.Api;

  constructor(name: string, args: ApiGatewayArgs, opts?: pulumi.ComponentResourceOptions) {
    super("local-cast:components:ApiGateway", name, args, opts);

    /** HTTP API that acts as the Lambda proxy. */
    this.api = new aws.apigatewayv2.Api("http-api", {
      name: `${args.projectName}-api`,
      protocolType: "HTTP",
    }, { parent: this });

    /** Lambda integration connecting API Gateway to the backend function. */
    const integration = new aws.apigatewayv2.Integration("lambda-integration", {
      apiId: this.api.id,
      integrationType: "AWS_PROXY",
      integrationUri: args.lambdaFn.invokeArn,
      payloadFormatVersion: "2.0",
    }, { parent: this });

    /**
     * Lambda authorizer for protected routes. Validates the x-origin-verify
     * header and the JWT session cookie. Caches the result for 5 minutes keyed
     * on the Cookie and x-origin-verify headers. Requests missing either header
     * are rejected immediately without invoking the authorizer Lambda.
     */
    const authorizer = new aws.apigatewayv2.Authorizer("lambda-authorizer", {
      apiId: this.api.id,
      authorizerType: "REQUEST",
      authorizerUri: args.authorizerFn.invokeArn,
      authorizerPayloadFormatVersion: "2.0",
      enableSimpleResponses: true,
      identitySources: ["$request.header.cookie", "$request.header.x-origin-verify"],
      authorizerResultTtlInSeconds: 300,
    }, { parent: this });

    /**
     * Origin-verify authorizer for unprotected routes. Validates only the
     * x-origin-verify header to ensure requests come through CloudFront.
     * Caches the result for 5 minutes keyed on the header value.
     */
    const originVerifyAuthorizer = new aws.apigatewayv2.Authorizer("origin-verify-authorizer", {
      apiId: this.api.id,
      authorizerType: "REQUEST",
      authorizerUri: args.originVerifyFn.invokeArn,
      authorizerPayloadFormatVersion: "2.0",
      enableSimpleResponses: true,
      identitySources: ["$request.header.x-origin-verify"],
      authorizerResultTtlInSeconds: 300,
    }, { parent: this });

    /* ─── Routes verified by origin header only ─── */

    /** Auth endpoints (login/logout) — origin-verify authorization only. */
    new aws.apigatewayv2.Route("auth-route", {
      apiId: this.api.id,
      routeKey: "ANY /api/auth/{proxy+}",
      target: pulumi.interpolate`integrations/${integration.id}`,
      authorizationType: "CUSTOM",
      authorizerId: originVerifyAuthorizer.id,
    }, { parent: this });

    /** Health check — origin-verify authorization only. */
    new aws.apigatewayv2.Route("health-route", {
      apiId: this.api.id,
      routeKey: "GET /api/health",
      target: pulumi.interpolate`integrations/${integration.id}`,
      authorizationType: "CUSTOM",
      authorizerId: originVerifyAuthorizer.id,
    }, { parent: this });

    /* ─── Protected routes (origin header + session cookie) ─── */

    /** Media endpoints — requires valid session via Lambda authorizer. */
    new aws.apigatewayv2.Route("media-route", {
      apiId: this.api.id,
      routeKey: "ANY /api/media/{proxy+}",
      target: pulumi.interpolate`integrations/${integration.id}`,
      authorizationType: "CUSTOM",
      authorizerId: authorizer.id,
    }, { parent: this });

    /** Default stage with auto-deploy and request throttling. */
    new aws.apigatewayv2.Stage("default-stage", {
      apiId: this.api.id,
      name: "$default",
      autoDeploy: true,
      defaultRouteSettings: {
        throttlingBurstLimit: 50,
        throttlingRateLimit: 100,
      },
    }, { parent: this });

    /** Grant API Gateway permission to invoke the backend Lambda. */
    new aws.lambda.Permission("apigw-lambda-permission", {
      action: "lambda:InvokeFunction",
      function: args.lambdaFn.name,
      principal: "apigateway.amazonaws.com",
      sourceArn: pulumi.interpolate`${this.api.executionArn}/*/*`,
    }, { parent: this });

    /** Grant API Gateway permission to invoke the authorizer Lambda. */
    new aws.lambda.Permission("apigw-authorizer-permission", {
      action: "lambda:InvokeFunction",
      function: args.authorizerFn.name,
      principal: "apigateway.amazonaws.com",
      sourceArn: pulumi.interpolate`${this.api.executionArn}/authorizers/${authorizer.id}`,
    }, { parent: this });

    /** Grant API Gateway permission to invoke the origin-verify Lambda. */
    new aws.lambda.Permission("apigw-origin-verify-permission", {
      action: "lambda:InvokeFunction",
      function: args.originVerifyFn.name,
      principal: "apigateway.amazonaws.com",
      sourceArn: pulumi.interpolate`${this.api.executionArn}/authorizers/${originVerifyAuthorizer.id}`,
    }, { parent: this });

    this.registerOutputs({
      api: this.api,
    });
  }
}
