import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

/** Constructor arguments for the EcrRepository component. */
export interface EcrRepositoryArgs {
  /** Project name prefix for AWS resource names. */
  projectName: string;
}

/**
 * ECR repository for the backend Lambda container image.
 * Includes a lifecycle policy to retain only the last 5 images.
 */
export class EcrRepository extends pulumi.ComponentResource {
  /** The ECR repository resource. */
  public readonly repo: aws.ecr.Repository;

  constructor(name: string, args: EcrRepositoryArgs, opts?: pulumi.ComponentResourceOptions) {
    super("local-cast:components:EcrRepository", name, args, opts);

    this.repo = new aws.ecr.Repository("backend-repo", {
      name: `${args.projectName}-backend`,
      imageTagMutability: "MUTABLE",
      forceDelete: true,
    }, { parent: this });

    /** Lifecycle policy: keep only the last 5 images to control storage costs. */
    new aws.ecr.LifecyclePolicy("backend-repo-lifecycle", {
      repository: this.repo.name,
      policy: JSON.stringify({
        rules: [
          {
            rulePriority: 1,
            description: "Keep last 5 images",
            selection: {
              tagStatus: "any",
              countType: "imageCountMoreThan",
              countNumber: 5,
            },
            action: { type: "expire" },
          },
        ],
      }),
    }, { parent: this });

    this.registerOutputs({
      repo: this.repo,
    });
  }
}
